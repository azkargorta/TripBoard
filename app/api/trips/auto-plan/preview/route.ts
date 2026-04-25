import { NextResponse } from "next/server";
import { enforceAiMonthlyBudgetOrThrow, trackAiUsage } from "@/lib/ai-budget";
import { monthKeyUtc } from "@/lib/ai-usage";
import type { TripCreationIntent } from "@/lib/trip-ai/tripCreationTypes";
import { getTripCreationFollowUp, resolveTripCreationDates } from "@/lib/trip-ai/tripCreationResolve";
import { normalizeTripAutoConfig } from "@/lib/trip-ai/tripAutoConfig";
import { deriveRouteStructure } from "@/lib/trip-ai/routeStructure";
import { generateExecutableItineraryFromStructure } from "@/lib/trip-ai/generateItineraryFromIntent";
import { validateAndRepairItinerary } from "@/lib/trip-ai/itineraryValidator";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const intent = body?.intent as TripCreationIntent | undefined;
    if (!intent) return NextResponse.json({ error: "Falta intent." }, { status: 400 });

    // Solo Premium + presupuesto IA
    const provider = "gemini";
    const monthKey = monthKeyUtc();
    const { supabase, userId, shouldTrack } = await enforceAiMonthlyBudgetOrThrow({ providerId: provider });
    const { data: profileRow } = await supabase.from("profiles").select("is_premium").eq("id", userId).maybeSingle();
    if (!Boolean((profileRow as any)?.is_premium)) {
      return NextResponse.json({ error: "Necesitas cuenta Premium para crear viajes automáticos.", code: "PREMIUM_REQUIRED" }, { status: 402 });
    }

    const miss = getTripCreationFollowUp(intent);
    if (miss) {
      return NextResponse.json({ status: "needs_clarification", question: miss.question, code: miss.code, intent }, { status: 200 });
    }

    const resolved = resolveTripCreationDates(intent);
    if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: 400 });
    if (resolved.endDate <= resolved.startDate) {
      return NextResponse.json({ error: "La fecha de fin debe ser posterior a la fecha de inicio." }, { status: 400 });
    }

    const config = normalizeTripAutoConfig(body?.config);
    const structure = await deriveRouteStructure({ resolved, config });

    const llm = await generateExecutableItineraryFromStructure(resolved, {
      provider,
      config,
      structure,
      latencyMode: "preview",
    });

    const repaired = await validateAndRepairItinerary({
      itinerary: llm.itinerary,
      destination: resolved.destination,
      baseCityByDay: structure.baseCityByDay,
      strictness: config.geo.strictness === "auto" ? "balanced" : config.geo.strictness,
    });

    if (shouldTrack) {
      await trackAiUsage({ supabase, userId, monthKey, provider, usage: llm.usage });
    }

    return NextResponse.json({
      status: "ok",
      resolved: {
        destination: resolved.destination,
        startDate: resolved.startDate,
        endDate: resolved.endDate,
        durationDays: resolved.durationDays,
        durationWarning: resolved.durationWarning ?? null,
      },
      itinerary: repaired.itinerary,
      repairedCount: repaired.repairedCount,
      structure,
      config,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo previsualizar el plan." }, { status: 500 });
  }
}

