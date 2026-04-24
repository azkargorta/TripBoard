import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enforceAiMonthlyBudgetOrThrow, trackAiUsage } from "@/lib/ai-budget";
import { monthKeyUtc } from "@/lib/ai-usage";
import type { TripCreationIntent, ExecutableItineraryPayload } from "@/lib/trip-ai/tripCreationTypes";
import { mergeTripCreationIntentLLM } from "@/lib/trip-ai/parseTripCreationIntent";
import { getTripCreationFollowUp, resolveTripCreationDates } from "@/lib/trip-ai/tripCreationResolve";
import { generateExecutableItineraryFromIntent } from "@/lib/trip-ai/generateItineraryFromIntent";
import { normalizeTripAutoConfig } from "@/lib/trip-ai/tripAutoConfig";
import type { TripAiUsage } from "@/lib/trip-ai/providers";
import { validateAndRepairItinerary } from "@/lib/trip-ai/itineraryValidator";
import type { RouteStructure } from "@/lib/trip-ai/routeStructure";

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
    const structure = body?.structure as RouteStructure | undefined;
    const config = normalizeTripAutoConfig(body?.config);
    const fastItinerary = body?.itinerary as ExecutableItineraryPayload | undefined;

    if (!draftIntent) return NextResponse.json({ error: "Falta draftIntent." }, { status: 400 });
    if (!structure || structure.version !== 1 || !Array.isArray(structure.baseCityByDay) || !structure.baseCityByDay.length) {
      return NextResponse.json({ error: "Falta structure válida." }, { status: 400 });
    }

    const monthKey = monthKeyUtc();
    let supabase: Awaited<ReturnType<typeof createClient>>;
    let userId: string;
    try {
      const res = await enforceAiMonthlyBudgetOrThrow({ providerId: provider });
      supabase = res.supabase;
      userId = res.userId;
    } catch (e) {
      const err: any = e;
      const status = typeof err?.httpStatus === "number" ? err.httpStatus : err?.code === "AI_BUDGET_EXCEEDED" ? 402 : 401;
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "No autenticado.", code: err?.code || null, budget: err?.budget || null },
        { status }
      );
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No hay sesión activa." }, { status: 401 });

    const { data: profileRow } = await supabase.from("profiles").select("is_premium").eq("id", userId).maybeSingle();
    if (!Boolean((profileRow as any)?.is_premium)) {
      return NextResponse.json(
        { error: "Necesitas cuenta Premium para mejorar planes automáticamente.", code: "PREMIUM_REQUIRED" },
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
      return NextResponse.json({ status: "needs_clarification", question: miss.question, code: miss.code, draftIntent: intent });
    }

    const resolved = resolveTripCreationDates(intent);
    if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: 400 });

    // Refinado: por ahora reutilizamos generador LLM existente y luego validamos/recortamos.
    // (Paso siguiente: pasar structure como constraint fuerte dentro del prompt. Lo haremos en la misma iteración si hace falta.)
    const { itinerary: refined, usage } = await generateExecutableItineraryFromIntent(resolved, { provider, config });
    await trackIfCountable({ supabase, userId, monthKey, usage });

    // Reparación dura de país/coherencia, usando baseCityByDay del structure.
    const { itinerary, repairedCount } = await validateAndRepairItinerary({
      itinerary: refined,
      destination: resolved.destination,
      baseCityByDay: structure.baseCityByDay,
      strictness: config.geo.strictness,
    });

    return NextResponse.json({
      status: "ok",
      draftIntent: resolved.intent,
      itinerary,
      structure,
      repairedCount,
      // Para UX: si el refine quedase muy pobre, el cliente puede mantener fastItinerary.
      hadFastItinerary: Boolean(fastItinerary?.days?.length),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo mejorar el plan." }, { status: 500 });
  }
}

