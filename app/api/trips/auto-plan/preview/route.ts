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

type PaceHint = "relajado" | "equilibrado" | "intenso";

function looksLikeCountryToken(token: string) {
  const t = clean(token).toLowerCase();
  if (!t) return false;
  // Lista mínima para evitar que el país se trate como “ciudad base”
  if (
    [
      "argentina",
      "españa",
      "espana",
      "spain",
      "italia",
      "italy",
      "francia",
      "france",
      "portugal",
      "japón",
      "japon",
      "japan",
      "croacia",
      "croatia",
      "méxico",
      "mexico",
      "chile",
      "perú",
      "peru",
      "colombia",
      "uruguay",
      "estados unidos",
      "usa",
      "united states",
    ].includes(t)
  ) {
    return true;
  }
  return false;
}

function parseHintText(intent: TripCreationIntent): { pace: PaceHint; themes: Set<string> } {
  const constraints = Array.isArray(intent.constraints) ? intent.constraints.map((x) => String(x || "").trim()) : [];
  const joined = constraints.join(" · ").toLowerCase();
  const pace: PaceHint = joined.includes("ritmo: relajado")
    ? "relajado"
    : joined.includes("ritmo: intenso")
      ? "intenso"
      : "equilibrado";

  const themesPart = (() => {
    const hit = constraints.find((c) => c.toLowerCase().startsWith("temas:"));
    if (!hit) return "";
    return hit.split(":").slice(1).join(":").trim().toLowerCase();
  })();
  const themes = themesPart
    ? themesPart
        .split(/[,·|/]+/g)
        .map((x) => x.trim())
        .filter(Boolean)
    : [];

  return { pace, themes: new Set(themes) };
}

function placeWeight(labelRaw: string, ctx: { pace: "relajado" | "equilibrado" | "intenso"; themes: Set<string> }): number {
  const label = clean(labelRaw).toLowerCase();
  if (!label) return 1;
  let w = 1;

  // Macro-destinos que suelen requerir 2+ noches
  if (/\b(patagonia|ruta 40|salta y jujuy|quebrada|bariloche|7 lagos|mendoza|ushuaia|calafate|chalt[eé]n|iguaz[uú]|pen[ií]nsula vald[eé]s)\b/.test(label)) {
    return 2.6;
  }
  if (/\b(buenos aires|madrid|barcelona|roma|tokio|kioto)\b/.test(label)) {
    return 2.1;
  }
  if (/\b(c[oó]rdoba|rosario|sevilla|granada|valencia|bilbao|osaka)\b/.test(label)) {
    return 1.5;
  }
  w = 1;

  // Ajustes por temas
  const has = (t: string) => ctx.themes.has(t);
  if (has("aventura") || has("naturaleza")) {
    if (/\b(chalt[eé]n|calafate|patagonia|bariloche|7 lagos|ushuaia|ruta 40)\b/.test(label)) w *= 1.25;
  }
  if (has("gastronómico") || has("gastronomico")) {
    if (/\b(mendoza)\b/.test(label)) w *= 1.35;
    if (/\b(buenos aires)\b/.test(label)) w *= 1.1;
  }
  if (has("relax") || has("romántico") || has("romantico")) {
    if (/\b(ushuaia|bariloche|mendoza|calafate)\b/.test(label)) w *= 1.15;
  }
  if (has("cultural") || has("fiesta") || has("shopping")) {
    if (/\b(buenos aires)\b/.test(label)) w *= 1.2;
  }

  // Ajuste por ritmo: en relajado concentramos más noches en destinos “pesados”
  const alpha = ctx.pace === "relajado" ? 1.25 : ctx.pace === "intenso" ? 0.95 : 1.1;
  return Math.max(1, w) ** alpha;
}

function distributeDaysByWeight(totalDays: number, cities: string[], ctx: { pace: "relajado" | "equilibrado" | "intenso"; themes: Set<string> }): number[] {
  const n = Math.max(1, Math.round(totalDays));
  const c = Math.max(1, cities.length);
  if (c === 1) return [n];
  const weights = cities.map((city) => placeWeight(city, ctx));
  const totalWeight = weights.reduce((a, b) => a + b, 0) || c;
  const days = new Array<number>(c).fill(1);
  let assigned = c;

  const scored = weights.map((w, i) => ({ i, extra: (w / totalWeight) * Math.max(0, n - c) }));
  for (const item of scored) {
    const add = Math.floor(item.extra);
    days[item.i] += add;
    assigned += add;
  }
  let remaining = n - assigned;
  const order = [...scored].sort((a, b) => b.extra - a.extra);
  let ptr = 0;
  while (remaining > 0) {
    const idx = order[ptr % order.length]!.i;
    days[idx] += 1;
    remaining -= 1;
    ptr += 1;
  }
  return days;
}

function buildStructureFromUserPlaces(params: { intent: TripCreationIntent; durationDays: number }) {
  const destRaw = clean(params.intent.destination);
  const listRaw = destRaw ? splitPlaceList(destRaw) : [];
  const countryCandidate = clean(destRaw.split(/[|·]/g)[0] || "");
  const list = listRaw.filter((x) => clean(x).toLowerCase() !== countryCandidate.toLowerCase() && !looksLikeCountryToken(x));
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

  const ctx = parseHintText(params.intent);
  const daysByCity = distributeDaysByWeight(params.durationDays, cities, ctx);
  const baseCityByDay: string[] = [];
  for (let i = 0; i < cities.length; i++) {
    for (let k = 0; k < (daysByCity[i] || 1); k++) baseCityByDay.push(cities[i]!);
  }
  const normalized = baseCityByDay.slice(0, params.durationDays);
  while (normalized.length < params.durationDays) normalized.push(normalized[normalized.length - 1] || cities[cities.length - 1] || "Destino");

  return { version: 1 as const, baseCityByDay: normalized, segments: [] as any[] };
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
    const structure = buildStructureFromUserPlaces({ intent: resolved.intent, durationDays: resolved.durationDays });

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

