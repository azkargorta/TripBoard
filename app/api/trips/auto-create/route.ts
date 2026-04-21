import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enforceAiMonthlyBudgetOrThrow, trackAiUsage } from "@/lib/ai-budget";
import { monthKeyUtc } from "@/lib/ai-usage";
import type { TripCreationIntent } from "@/lib/trip-ai/tripCreationTypes";
import { mergeTripCreationIntentLLM, parseTripCreationIntentLLM } from "@/lib/trip-ai/parseTripCreationIntent";
import {
  buildDefaultTripName,
  getTripCreationFollowUp,
  resolveTripCreationDates,
} from "@/lib/trip-ai/tripCreationResolve";
import { generateExecutableItineraryFromIntent } from "@/lib/trip-ai/generateItineraryFromIntent";
import { executePlanOnTrip } from "@/lib/trip-ai/executePlanOnTrip";
import { createTripWithOwner } from "@/lib/trips/createTripWithOwner";
import { ensureUserCanCreateTrip } from "@/lib/trips/tripCreationLimits";
import { getTripAccessForApi } from "@/lib/trip-access";
import { isPremiumEnabledForTrip } from "@/lib/entitlements";
import type { TripAiUsage } from "@/lib/trip-ai/providers";

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
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    const followUp = typeof body?.followUp === "string" ? body.followUp.trim() : "";
    const draftIntent = body?.draftIntent as TripCreationIntent | undefined;
    const previewOnly = Boolean(body?.previewOnly);

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
          error: "Necesitas cuenta Premium para crear un viaje automático con plan y rutas. Puedes crear el viaje a mano con el formulario.",
          code: "PREMIUM_REQUIRED",
        },
        { status: 402 }
      );
    }

    const gate = await ensureUserCanCreateTrip(supabase, userId);
    if ("error" in gate) {
      return NextResponse.json({ error: gate.error, code: gate.code }, { status: 402 });
    }

    let intent: TripCreationIntent;

    if (followUp && draftIntent) {
      const { intent: merged, usage } = await mergeTripCreationIntentLLM(draftIntent, followUp, { provider });
      intent = merged;
      await trackIfCountable({ supabase, userId, monthKey, usage });
    } else if (prompt) {
      const { intent: parsed, usage } = await parseTripCreationIntentLLM(prompt, { provider });
      intent = parsed;
      await trackIfCountable({ supabase, userId, monthKey, usage });
    } else {
      return NextResponse.json({ error: "Falta el texto del viaje (prompt) o una aclaración (followUp)." }, { status: 400 });
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

    if (previewOnly) {
      // Si las fechas han sido rellenadas por default (no venían del usuario), pedimos fechas explícitas.
      if (resolved.datesInferred) {
        const nextIntent: TripCreationIntent = {
          ...resolved.intent,
          // forzamos a pedir fechas; mantenemos duración y destino
          startDate: null,
          endDate: null,
        };
        return NextResponse.json({
          status: "needs_clarification",
          question:
            "¿Qué fechas exactas tienes para el viaje? (inicio y fin). Si aún no lo sabes, dime un mes aproximado.",
          code: "duration_or_dates",
          draftIntent: nextIntent,
        });
      }
      return NextResponse.json({
        status: "ready",
        draftIntent: resolved.intent,
        resolved: {
          destination: resolved.destination,
          startDate: resolved.startDate,
          endDate: resolved.endDate,
          durationDays: resolved.durationDays,
        },
      });
    }

    const tripName = (intent.suggestedTripName || "").trim() || buildDefaultTripName(resolved);
    const tripRes = await createTripWithOwner(supabase, user, {
      name: tripName.slice(0, 120),
      destination: resolved.destination,
      start_date: resolved.startDate,
      end_date: resolved.endDate,
      base_currency: "EUR",
    });
    if ("error" in tripRes) {
      return NextResponse.json({ error: tripRes.error }, { status: 400 });
    }

    const tripId = tripRes.tripId;

    const accessResult = await getTripAccessForApi(supabase, tripId);
    if (!accessResult.ok) {
      return NextResponse.json({
        status: "partial",
        tripId,
        error: accessResult.error,
        draftIntent: intent,
      });
    }
    const access = accessResult.access;
    const premiumTrip = await isPremiumEnabledForTrip({ supabase, userId, tripId });
    if (!premiumTrip || !access.can_manage_plan) {
      return NextResponse.json(
        {
          status: "partial",
          tripId,
          error: "No se pudo aplicar el plan automático (permisos o Premium del viaje).",
          draftIntent: intent,
        },
        { status: 200 }
      );
    }

    const { itinerary, usage: u2 } = await generateExecutableItineraryFromIntent(resolved, { provider });
    await trackIfCountable({ supabase, userId, monthKey, usage: u2 });

    const requestOrigin = new URL(req.url).origin;
    const exec = await executePlanOnTrip({
      supabase,
      tripId,
      itinerary,
      conflictResolution: "add",
      requestOrigin,
      access: { userId: access.userId, can_manage_map: access.can_manage_map },
      tripDestination: resolved.destination,
    });

    if (!exec.ok) {
      return NextResponse.json({
        status: "partial",
        tripId,
        error: exec.error,
        draftIntent: intent,
        resolved: {
          destination: resolved.destination,
          startDate: resolved.startDate,
          endDate: resolved.endDate,
          durationDays: resolved.durationDays,
        },
      });
    }

    return NextResponse.json({
      status: "created",
      tripId,
      createdActivities: exec.created,
      routesCreated: exec.routesCreated,
      routesNote: exec.routesNote,
      resolved: {
        destination: resolved.destination,
        startDate: resolved.startDate,
        endDate: resolved.endDate,
        durationDays: resolved.durationDays,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo crear el viaje automático." },
      { status: 500 }
    );
  }
}
