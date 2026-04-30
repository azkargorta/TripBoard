import { NextResponse } from "next/server";
import { enforceAiMonthlyBudgetOrThrow } from "@/lib/ai-budget";
import type { TripCreationIntent } from "@/lib/trip-ai/tripCreationTypes";
import { getTripCreationFollowUp, resolveTripCreationDates } from "@/lib/trip-ai/tripCreationResolve";
import { buildRouteStructureFromIntent, hasHardcodedWeight } from "@/lib/trip-ai/nightAllocation";
import { fetchAiCityWeights } from "@/lib/trip-ai/aiCityWeights";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const intent = body?.intent as TripCreationIntent | undefined;
    if (!intent) return NextResponse.json({ error: "Falta intent." }, { status: 400 });

    // Premium check (sin gastar IA)
    const { supabase, userId } = await enforceAiMonthlyBudgetOrThrow({ providerId: "gemini" });
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

    // Probe pass: get the city list so we can identify unknown destinations.
    const probeStructure = buildRouteStructureFromIntent({ intent: resolved.intent, durationDays: resolved.durationDays });
    const unknownCities = probeStructure.cityStays.filter(({ city }) => !hasHardcodedWeight(city)).map(({ city }) => city);

    // Fetch AI-recommended day counts for cities not covered by the hardcoded weight table.
    const weightOverrides = await fetchAiCityWeights(unknownCities, resolved.durationDays);

    // Final pass with AI overrides applied (no-op if overrides map is empty).
    const structure = weightOverrides.size > 0
      ? buildRouteStructureFromIntent({ intent: resolved.intent, durationDays: resolved.durationDays }, weightOverrides)
      : probeStructure;

    return NextResponse.json({
      status: "ok",
      resolved: {
        destination: resolved.destination,
        startDate: resolved.startDate,
        endDate: resolved.endDate,
        durationDays: resolved.durationDays,
        durationWarning: resolved.durationWarning ?? null,
      },
      structure,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo calcular el reparto de noches." }, { status: 500 });
  }
}

