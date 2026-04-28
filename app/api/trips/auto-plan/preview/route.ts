import { NextResponse } from "next/server";
import { enforceAiMonthlyBudgetOrThrow, trackAiUsage } from "@/lib/ai-budget";
import { monthKeyUtc } from "@/lib/ai-usage";
import type { TripCreationIntent } from "@/lib/trip-ai/tripCreationTypes";
import { getTripCreationFollowUp, resolveTripCreationDates } from "@/lib/trip-ai/tripCreationResolve";
import { normalizeTripAutoConfig } from "@/lib/trip-ai/tripAutoConfig";
import { generateExecutableItineraryFastFromIntent } from "@/lib/trip-ai/generateItineraryFromIntent";

export const runtime = "nodejs";
export const maxDuration = 120;

function clean(s: unknown) {
  return String(s || "").trim();
}

function splitPlaceList(raw: string): string[] {
  const parts = raw
    .split(/[|·,;/\n\r]+/g)
    .map((x) => x.trim())
    .filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    const k = p.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out.slice(0, 10);
}

function distributeDays(totalDays: number, cityCount: number): number[] {
  const n = Math.max(1, Math.round(totalDays));
  const c = Math.max(1, Math.round(cityCount));
  if (c === 1) return [n];
  const base = new Array<number>(c).fill(1);
  let remaining = n - c;
  let idx = 0;
  while (remaining > 0) {
    base[idx % c] = (base[idx % c] || 0) + 1;
    remaining -= 1;
    idx += 1;
  }
  return base;
}

function buildStructureFromUserPlaces(params: { intent: TripCreationIntent; durationDays: number }) {
  const destRaw = clean(params.intent.destination);
  const list = destRaw ? splitPlaceList(destRaw) : [];
  const start = clean(params.intent.startLocation);
  const end = clean(params.intent.endLocation);

  const cities: string[] = [];
  const push = (s: string) => {
    const t = clean(s);
    if (!t) return;
    if (cities.some((x) => x.toLowerCase() === t.toLowerCase())) return;
    cities.push(t);
  };
  // Si el usuario mete start/end, los priorizamos.
  if (start) push(start);
  for (const p of list) push(p);
  if (end) push(end);
  if (!cities.length) push(destRaw || "Destino");

  const daysByCity = distributeDays(params.durationDays, cities.length);
  const baseCityByDay: string[] = [];
  for (let i = 0; i < cities.length; i++) {
    for (let k = 0; k < (daysByCity[i] || 1); k++) baseCityByDay.push(cities[i]!);
  }
  const normalized = baseCityByDay.slice(0, params.durationDays);
  while (normalized.length < params.durationDays) normalized.push(normalized[normalized.length - 1] || cities[cities.length - 1] || "Destino");

  return { version: 1 as const, baseCityByDay: normalized, segments: [] as any[] };
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
    const structure = buildStructureFromUserPlaces({ intent: resolved.intent, durationDays: resolved.durationDays });

    // Preview 100% rápido y determinista: sin IA, sin geocoding, sin riesgo de timeout.
    // La mejora con IA se hace luego en chunks pequeños desde el cliente.
    const llm = await generateExecutableItineraryFastFromIntent(resolved, { config, structure });

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

