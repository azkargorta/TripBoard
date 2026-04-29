import { NextResponse } from "next/server";
import { enforceAiMonthlyBudgetOrThrow, trackAiUsage } from "@/lib/ai-budget";
import { monthKeyUtc } from "@/lib/ai-usage";
import type { TripCreationIntent } from "@/lib/trip-ai/tripCreationTypes";
import { getTripCreationFollowUp, resolveTripCreationDates } from "@/lib/trip-ai/tripCreationResolve";
import { normalizeTripAutoConfig } from "@/lib/trip-ai/tripAutoConfig";
import { generateExecutableItineraryFastFromIntent } from "@/lib/trip-ai/generateItineraryFromIntent";
import { buildRouteStructureFromIntent } from "@/lib/trip-ai/nightAllocation";

export const runtime = "nodejs";
export const maxDuration = 120;

function clean(s: unknown) {
  return String(s || "").trim();
}

function filterMustSeeAgainstRoute(params: { mustSee: string[]; baseCityByDay: string[] }) {
  const cities = Array.from(new Set(params.baseCityByDay.map((x) => clean(x).toLowerCase()).filter(Boolean)));
  const keep: string[] = [];
  for (const raw of params.mustSee || []) {
    const t = clean(raw);
    if (!t) continue;
    const lc = t.toLowerCase();
    const isCityLike = cities.some((c) => c === lc || c.includes(lc) || lc.includes(c));
    if (isCityLike) continue;
    keep.push(t);
  }
  return keep.slice(0, 18);
}

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
    if (resolved.endDate < resolved.startDate) {
      return NextResponse.json({ error: "La fecha de fin no puede ser anterior a la fecha de inicio." }, { status: 400 });
    }

    const config = normalizeTripAutoConfig(body?.config);
    // MUY IMPORTANTE (Vercel): evitamos geocoding en preview (deriveRouteStructure + validateAndRepairItinerary).
    // Construimos una estructura determinista solo con la lista del usuario para que el endpoint siempre responda.
    const structure = buildRouteStructureFromIntent({ intent: resolved.intent, durationDays: resolved.durationDays });

    // Preview 100% rápido y determinista: sin IA, sin geocoding, sin riesgo de timeout.
    // La mejora con IA se hace luego en chunks pequeños desde el cliente.
    const resolvedFast: typeof resolved = {
      ...resolved,
      intent: {
        ...resolved.intent,
        mustSee: filterMustSeeAgainstRoute({ mustSee: resolved.intent.mustSee || [], baseCityByDay: structure.baseCityByDay }),
      },
    };
    const llm = await generateExecutableItineraryFastFromIntent(resolvedFast as any, { config, structure });

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
      itinerary: llm.itinerary,
      repairedCount: 0,
      structure,
      config,
      partial: true,
      partialAiDays: 0,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo previsualizar el plan." }, { status: 500 });
  }
}

