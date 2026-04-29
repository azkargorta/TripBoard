import type { TripCreationIntent } from "@/lib/trip-ai/tripCreationTypes";

type PaceHint = "relajado" | "equilibrado" | "intenso";

function clean(s: unknown) {
  return String(s || "").trim();
}

function normalize(s: unknown) {
  return clean(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function splitPlaceList(raw: string): string[] {
  const parts = raw
    .split(/[|·,;/\n\r]+/g)
    .map((x) => x.trim())
    .filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    const k = normalize(p);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out.slice(0, 10);
}

function looksLikeCountryToken(token: string) {
  const t = normalize(token);
  if (!t) return false;
  return [
    "argentina",
    "espana",
    "spain",
    "italia",
    "italy",
    "francia",
    "france",
    "portugal",
    "japon",
    "japan",
    "croacia",
    "croatia",
    "mexico",
    "chile",
    "peru",
    "colombia",
    "uruguay",
    "estados unidos",
    "usa",
    "united states",
  ].includes(t);
}

function parseHintText(intent: TripCreationIntent): { pace: PaceHint; themes: Set<string>; notes: string } {
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
  const notes = constraints
    .filter((c) => c.toLowerCase().startsWith("notas del usuario:"))
    .map((c) => c.split(":").slice(1).join(":").trim())
    .join(" · ");
  const themes = themesPart
    ? themesPart
        .split(/[,·|/]+/g)
        .map((x) => x.trim())
        .filter(Boolean)
    : [];

  return { pace, themes: new Set(themes), notes };
}

function placeWeight(labelRaw: string, ctx: { pace: PaceHint; themes: Set<string> }): number {
  const label = normalize(labelRaw);
  if (!label) return 1;
  let w = 1;

  if (/\b(patagonia|ruta 40|salta y jujuy|quebrada|bariloche|7 lagos|mendoza|ushuaia|calafate|chalten|iguazu|peninsula valdes)\b/.test(label)) {
    w = 2.6;
  } else if (/\b(buenos aires|madrid|barcelona|roma|tokio|kioto)\b/.test(label)) {
    w = 2.1;
  } else if (/\b(cordoba|rosario|sevilla|granada|valencia|bilbao|osaka)\b/.test(label)) {
    w = 1.5;
  }

  const has = (t: string) => ctx.themes.has(t);
  if (has("aventura") || has("naturaleza")) {
    if (/\b(chalten|calafate|patagonia|bariloche|7 lagos|ushuaia|ruta 40)\b/.test(label)) w *= 1.25;
  }
  if (has("gastronomico") || has("gastronómico")) {
    if (/\b(mendoza)\b/.test(label)) w *= 1.35;
    if (/\b(buenos aires)\b/.test(label)) w *= 1.1;
  }
  if (has("relax") || has("romantico") || has("romántico")) {
    if (/\b(ushuaia|bariloche|mendoza|calafate)\b/.test(label)) w *= 1.15;
  }
  if (has("cultural") || has("fiesta") || has("shopping")) {
    if (/\b(buenos aires)\b/.test(label)) w *= 1.2;
  }

  const alpha = ctx.pace === "relajado" ? 1.25 : ctx.pace === "intenso" ? 0.95 : 1.1;
  return Math.max(1, w) ** alpha;
}

function distributeDaysByWeight(totalDays: number, cities: string[], ctx: { pace: PaceHint; themes: Set<string> }): number[] {
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

function minNightsByCity(labelRaw: string): number {
  const label = normalize(labelRaw);
  if (!label) return 1;
  if (/\b(buenos aires)\b/.test(label)) return 4;
  if (/\b(iguazu|cataratas)\b/.test(label)) return 2;
  if (/\b(salta|jujuy|quebrada)\b/.test(label)) return 4;
  if (/\b(mendoza)\b/.test(label)) return 3;
  if (/\b(calafate)\b/.test(label)) return 3;
  if (/\b(ushuaia)\b/.test(label)) return 3;
  return 1;
}

function cityAliases(labelRaw: string): string[] {
  const label = normalize(labelRaw);
  const rawParts = label
    .split(/[()]/g)
    .flatMap((part) => part.split(/\by\b|\+|,|\/|-/g))
    .map((x) => x.trim())
    .filter(Boolean);
  const aliases = new Set<string>();
  aliases.add(label);
  for (const part of rawParts) {
    if (part.length >= 4 && !looksLikeCountryToken(part)) aliases.add(part);
  }
  return [...aliases].sort((a, b) => b.length - a.length);
}

function parseUserNightOverrides(notesRaw: string, cities: string[]) {
  const notes = normalize(notesRaw);
  const out = new Map<number, number>();
  if (!notes) return out;

  for (let i = 0; i < cities.length; i++) {
    const aliases = cityAliases(cities[i] || "");
    let nights: number | null = null;
    for (const alias of aliases) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const patterns = [
        new RegExp(`(\\d{1,2})\\s*(?:noches|dias|días)\\s*(?:en|para)?\\s*${escaped}`),
        new RegExp(`${escaped}[^\\d]{0,24}(\\d{1,2})\\s*(?:noches|dias|días)`),
      ];
      for (const p of patterns) {
        const m = notes.match(p);
        if (m?.[1]) {
          nights = Math.max(1, Math.min(30, Number(m[1])));
          break;
        }
      }
      if (nights) break;
    }
    if (nights) out.set(i, nights);
  }
  return out;
}

function applyCityMinimumsAndOverrides(days: number[], cities: string[], totalDays: number, notes: string) {
  const out = [...days];
  const n = Math.max(1, Math.round(totalDays));
  const mins = cities.map((c) => minNightsByCity(c));
  const overrides = parseUserNightOverrides(notes, cities);

  for (let i = 0; i < out.length; i++) {
    const locked = overrides.get(i);
    out[i] = Math.max(out[i] || 1, locked ?? mins[i] ?? 1);
  }

  let current = out.reduce((a, b) => a + b, 0);
  let guard = 0;
  while (current > n && guard < 500) {
    let idx = -1;
    let best = -1;
    for (let i = 0; i < out.length; i++) {
      if (overrides.has(i)) continue;
      const removable = (out[i] || 0) - (mins[i] || 1);
      if (removable > best) {
        best = removable;
        idx = i;
      }
    }
    if (idx < 0 || best <= 0) break;
    out[idx] -= 1;
    current -= 1;
    guard += 1;
  }

  while (current < n) {
    let idx = 0;
    let best = -Infinity;
    for (let i = 0; i < cities.length; i++) {
      if (overrides.has(i)) continue;
      const score = minNightsByCity(cities[i] || "") - (out[i] || 0) * 0.1;
      if (score > best) {
        best = score;
        idx = i;
      }
    }
    out[idx] += 1;
    current += 1;
  }
  return out;
}

export function buildRouteStructureFromIntent(params: { intent: TripCreationIntent; durationDays: number }) {
  const destRaw = clean(params.intent.destination);
  const listRaw = destRaw ? splitPlaceList(destRaw) : [];
  const countryCandidate = clean(destRaw.split(/[|·]/g)[0] || "");
  const list = listRaw.filter((x) => normalize(x) !== normalize(countryCandidate) && !looksLikeCountryToken(x));
  const start = clean(params.intent.startLocation);
  const end = clean(params.intent.endLocation);

  const cities: string[] = [];
  const push = (s: string) => {
    const t = clean(s);
    if (!t) return;
    if (cities.some((x) => normalize(x) === normalize(t))) return;
    cities.push(t);
  };
  if (start) push(start);
  for (const p of list) push(p);
  if (end) push(end);
  if (!cities.length) push(destRaw || "Destino");

  const ctx = parseHintText(params.intent);
  const weighted = distributeDaysByWeight(params.durationDays, cities, ctx);
  const stays = applyCityMinimumsAndOverrides(weighted, cities, params.durationDays, ctx.notes);

  const baseCityByDay: string[] = [];
  for (let i = 0; i < cities.length; i++) {
    for (let k = 0; k < (stays[i] || 1); k++) baseCityByDay.push(cities[i]!);
  }
  const normalizedDays = baseCityByDay.slice(0, params.durationDays);
  while (normalizedDays.length < params.durationDays) normalizedDays.push(normalizedDays[normalizedDays.length - 1] || cities[cities.length - 1] || "Destino");

  return {
    version: 1 as const,
    baseCityByDay: normalizedDays,
    segments: [] as any[],
    cityStays: cities.map((city, i) => ({ city, days: stays[i] || 1 })),
  };
}
