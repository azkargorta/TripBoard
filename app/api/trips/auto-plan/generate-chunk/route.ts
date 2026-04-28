import { NextResponse } from "next/server";
import { enforceAiMonthlyBudgetOrThrow, trackAiUsage } from "@/lib/ai-budget";
import { monthKeyUtc } from "@/lib/ai-usage";
import type { TripCreationIntent } from "@/lib/trip-ai/tripCreationTypes";
import { resolveTripCreationDates } from "@/lib/trip-ai/tripCreationResolve";
import { normalizeTripAutoConfig } from "@/lib/trip-ai/tripAutoConfig";
import { generateExecutableItineraryFromStructure } from "@/lib/trip-ai/generateItineraryFromIntent";
import { addDaysIso } from "@/lib/trip-ai/tripCreationDates";

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

  if (/\b(patagonia|ruta 40|salta y jujuy|quebrada|bariloche|7 lagos|mendoza|ushuaia|calafate|chalt[eé]n|iguaz[uú]|pen[ií]nsula vald[eé]s)\b/.test(label)) {
    w = 2.6;
  } else if (/\b(buenos aires|madrid|barcelona|roma|tokio|kioto)\b/.test(label)) {
    w = 2.1;
  } else if (/\b(c[oó]rdoba|rosario|sevilla|granada|valencia|bilbao|osaka)\b/.test(label)) {
    w = 1.5;
  }

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
    // Si el token es (o contiene) una de las ciudades base, NO lo forzamos como actividad.
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
    const offsetRaw = body?.dayOffset;
    const countRaw = body?.dayCount;
    const dayOffset = typeof offsetRaw === "number" && Number.isFinite(offsetRaw) ? Math.max(0, Math.round(offsetRaw)) : 0;
    const dayCount = typeof countRaw === "number" && Number.isFinite(countRaw) ? Math.max(1, Math.min(2, Math.round(countRaw))) : 2;

    const provider = "gemini";
    const monthKey = monthKeyUtc();
    const { supabase, userId, shouldTrack } = await enforceAiMonthlyBudgetOrThrow({ providerId: provider });
    const { data: profileRow } = await supabase.from("profiles").select("is_premium").eq("id", userId).maybeSingle();
    if (!Boolean((profileRow as any)?.is_premium)) {
      return NextResponse.json({ error: "Necesitas cuenta Premium para usar IA.", code: "PREMIUM_REQUIRED" }, { status: 402 });
    }

    const resolved = resolveTripCreationDates(intent);
    if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: 400 });

    const totalDays = Math.max(1, resolved.durationDays);
    if (dayOffset >= totalDays) return NextResponse.json({ error: "dayOffset fuera de rango." }, { status: 400 });
    const count = Math.min(dayCount, totalDays - dayOffset);

    const config = normalizeTripAutoConfig(body?.config);
    const fullStructure = buildStructureFromUserPlaces({ intent: resolved.intent, durationDays: totalDays });
    const sliceStructure = { ...fullStructure, baseCityByDay: fullStructure.baseCityByDay.slice(dayOffset, dayOffset + count) };

    // Clave: evitamos que ciudades/regiones del recorrido se inyecten como "Visita: X" en un día cualquiera.
    const cleanedIntent: TripCreationIntent = {
      ...resolved.intent,
      mustSee: filterMustSeeAgainstRoute({ mustSee: resolved.intent.mustSee || [], baseCityByDay: fullStructure.baseCityByDay }),
    };

    // Creamos un resolved “slice” para que el generador produzca solo esos días.
    const sliceStart = addDaysIso(resolved.startDate, dayOffset);
    const sliceResolved: any = {
      ...resolved,
      intent: cleanedIntent,
      startDate: sliceStart,
      durationDays: count,
    };

    const prompts: string[] = [];
    const out = await generateExecutableItineraryFromStructure(sliceResolved, {
      provider,
      config,
      structure: sliceStructure as any,
      latencyMode: "preview",
      debug: { prompts },
    });

    const days = (out.itinerary.days || []).map((d) => ({
      ...d,
      day: typeof d.day === "number" ? d.day + dayOffset : d.day,
      date: typeof d.date === "string" && d.date ? d.date : addDaysIso(resolved.startDate, (typeof d.day === "number" ? d.day - 1 : 0) + dayOffset),
    }));

    if (shouldTrack) {
      await trackAiUsage({ supabase, userId, monthKey, provider, usage: out.usage });
    }

    return NextResponse.json({ status: "ok", dayOffset, dayCount: count, days, prompts });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo generar el chunk." }, { status: 500 });
  }
}

