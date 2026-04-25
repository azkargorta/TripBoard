import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enforceAiMonthlyBudgetOrThrow, trackAiUsage } from "@/lib/ai-budget";
import { monthKeyUtc } from "@/lib/ai-usage";
import type { TripCreationIntent } from "@/lib/trip-ai/tripCreationTypes";
import { mergeTripCreationIntentLLM } from "@/lib/trip-ai/parseTripCreationIntent";
import { getTripCreationFollowUp, resolveTripCreationDates } from "@/lib/trip-ai/tripCreationResolve";
import {
  generateExecutableItineraryFastFromIntent,
  generateExecutableItineraryFromIntent,
  generateExecutableItineraryFromStructure,
} from "@/lib/trip-ai/generateItineraryFromIntent";
import { normalizeTripAutoConfig } from "@/lib/trip-ai/tripAutoConfig";
import type { TripAiUsage } from "@/lib/trip-ai/providers";
import { deriveRouteStructure } from "@/lib/trip-ai/routeStructure";
import { validateAndRepairItinerary } from "@/lib/trip-ai/itineraryValidator";

export const runtime = "nodejs";
export const maxDuration = 300;

async function trackIfCountable(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  monthKey: string;
  usage: TripAiUsage;
}) {
  if (typeof params.usage.inputTokens === "number" && typeof params.usage.outputTokens === "number") {
    await trackAiUsage({
      supabase: params.supabase,
      userId: params.userId,
      provider: "gemini",
      monthKey: params.monthKey,
      usage: params.usage,
    });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const provider = typeof body?.provider === "string" ? body.provider : null;
    const followUp = typeof body?.followUp === "string" ? body.followUp.trim() : "";
    const draftIntent = body?.draftIntent as TripCreationIntent | undefined;
    if (!draftIntent) {
      return NextResponse.json({ error: "Falta draftIntent." }, { status: 400 });
    }
    const config = normalizeTripAutoConfig(body?.config);

    const monthKey = monthKeyUtc();
    let supabase: Awaited<ReturnType<typeof createClient>>;
    let userId: string;
    try {
      const res = await enforceAiMonthlyBudgetOrThrow({ providerId: provider });
      supabase = res.supabase;
      userId = res.userId;
    } catch (e) {
      const err: any = e;
      const status =
        typeof err?.httpStatus === "number" ? err.httpStatus : err?.code === "AI_BUDGET_EXCEEDED" ? 402 : 401;
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "No autenticado.", code: err?.code || null, budget: err?.budget || null },
        { status }
      );
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "No hay sesión activa." }, { status: 401 });
    }

    const { data: profileRow } = await supabase.from("profiles").select("is_premium").eq("id", userId).maybeSingle();
    const profilePremium = Boolean((profileRow as { is_premium?: boolean } | null)?.is_premium);
    if (!profilePremium) {
      return NextResponse.json(
        {
          error:
            "Necesitas cuenta Premium para previsualizar planes automáticamente. Puedes crear el viaje a mano con el formulario.",
          code: "PREMIUM_REQUIRED",
        },
        { status: 402 }
      );
    }

    let intent: TripCreationIntent = draftIntent;
    if (followUp) {
      const merged = await mergeTripCreationIntentLLM(draftIntent, followUp, { provider });
      intent = merged.intent;
      await trackIfCountable({ supabase, userId, monthKey, usage: merged.usage });
    }

    const miss = getTripCreationFollowUp(intent);
    if (miss) {
      return NextResponse.json({
        status: "needs_clarification",
        question: miss.question,
        code: miss.code,
        draftIntent: intent,
      });
    }

    const resolved = resolveTripCreationDates(intent);
    if ("error" in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: 400 });
    }

    // Si las fechas han sido inferidas por defecto, pedimos fechas explícitas.
    if (resolved.datesInferred) {
      const nextIntent: TripCreationIntent = {
        ...resolved.intent,
        startDate: null,
        endDate: null,
      };
      return NextResponse.json({
        status: "needs_clarification",
        question: "¿Qué fechas exactas tienes para el viaje? (inicio y fin). Si aún no lo sabes, dime un mes aproximado.",
        code: "duration_or_dates",
        draftIntent: nextIntent,
      });
    }

    // Por defecto intentamos generar el itinerario completo con LLM (chunked) para evitar el efecto
    // de "días clonados" del fallback. Si el cliente fuerza fast (fast=1) o si falla el LLM,
    // caemos a fast para asegurar respuesta.
    const structure = await deriveRouteStructure({ resolved, config });
    const wantFast = String(body?.fast || "").trim() === "1";

    let rawItinerary: any = null;
    let usage: TripAiUsage = { provider: "gemini", model: null, inputTokens: 0, outputTokens: 0 };
    let usedFast = wantFast;
    let fastFallbackReason: string | null = null;

    if (!wantFast) {
      try {
        const llm = await generateExecutableItineraryFromStructure(resolved, {
          provider,
          config,
          structure,
          // Vercel suele cortar por ~60s aunque maxDuration sea mayor: optimizamos latencia aquí.
          latencyMode: "preview",
        });
        rawItinerary = llm.itinerary;
        usage = llm.usage;
      } catch (e) {
        usedFast = true;
        fastFallbackReason = e instanceof Error ? e.message : "Error al generar con LLM";
      }
    }

    if (usedFast) {
      const fast = await generateExecutableItineraryFastFromIntent(resolved, { config, structure });
      rawItinerary = fast.itinerary;
      usage = fast.usage;
    }

    const { itinerary, repairedCount } = await validateAndRepairItinerary({
      itinerary: rawItinerary,
      destination: resolved.destination,
      baseCityByDay: structure.baseCityByDay,
      strictness:
        config.geo.strictness === "auto"
          ? new Set(structure.baseCityByDay.map((c) => String(c || "").trim().toLowerCase()).filter(Boolean)).size <= 1
            ? "strict"
            : "balanced"
          : config.geo.strictness,
    });
    await trackIfCountable({ supabase, userId, monthKey, usage });

    return NextResponse.json({
      status: "ok",
      draftIntent: resolved.intent,
      resolved: {
        destination: resolved.destination,
        startDate: resolved.startDate,
        endDate: resolved.endDate,
        durationDays: resolved.durationDays,
        durationWarning: resolved.durationWarning ?? null,
      },
      itinerary,
      config,
      structure,
      fast: usedFast,
      ...(fastFallbackReason ? { fastFallbackReason } : {}),
      repairedCount,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo previsualizar los planes." },
      { status: 500 }
    );
  }
}

