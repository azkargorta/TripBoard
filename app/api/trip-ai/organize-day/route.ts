import { NextResponse } from "next/server";
import { enforceAiMonthlyBudgetOrThrow, trackAiUsage } from "@/lib/ai-budget";
import { monthKeyUtc } from "@/lib/ai-usage";
import { isPremiumEnabledForTrip } from "@/lib/entitlements";
import { buildTripContext } from "@/lib/trip-ai/buildTripContext";
import { askTripAIWithUsage } from "@/lib/trip-ai/providers";
import { createClient } from "@/lib/supabase/server";
import { safeInsertAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const maxDuration = 60;

type DayPlanItem = {
  title: string;
  kind: "visit" | "museum" | "activity" | "restaurant";
  query: string | null;
  startTime: string | null;
  durationMinutes: number;
  ticketRequired: boolean;
  notes: string | null;
};

type DayPlanPayload = {
  version: 1;
  date: string; // YYYY-MM-DD
  cityHint: string | null;
  travelMode: "driving" | "walking" | "cycling";
  dayStart: string | null;
  dayEnd: string | null;
  items: DayPlanItem[];
};

type RouteDraftPayload = {
  version: 1;
  date: string;
  travelMode: "DRIVING" | "WALKING" | "BICYCLING";
  routes: Array<{
    title: string;
    route_day: string;
    departure_time: string | null;
    travel_mode: "DRIVING" | "WALKING" | "BICYCLING";
    origin_name: string;
    origin_address: string | null;
    origin_latitude: number | null;
    origin_longitude: number | null;
    destination_name: string;
    destination_address: string | null;
    destination_latitude: number | null;
    destination_longitude: number | null;
    path_points: any[];
    route_points: any[];
    distance_text: string | null;
    duration_text: string | null;
    notes: string | null;
  }>;
};

type ChatTurn = { role: "user" | "assistant"; content: string };

function padHhMm(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  const m = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Math.max(0, Math.min(23, Number(m[1])));
  const mm = Math.max(0, Math.min(59, Number(m[2])));
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function inferKindFromTitle(title: string): DayPlanItem["kind"] {
  const t = title.toLowerCase();
  if (/almuerzo|cena|comida|restaurant|brunch|tapas|bar\b|café|cafe/.test(t)) return "restaurant";
  if (/museum|museo|rijks|van gogh|frank|gallery|galería|galeria/.test(t)) return "museum";
  if (/barco|crucero|canal|tour|bici|rent|alquiler/.test(t)) return "activity";
  return "visit";
}

function normalizeItemKind(ks: string, title: string): DayPlanItem["kind"] {
  const s = ks.toLowerCase();
  if (s === "restaurant" || s === "food") return "restaurant";
  if (s === "museum") return "museum";
  if (s === "activity") return "activity";
  if (s === "visit") return "visit";
  return inferKindFromTitle(title);
}

function normalizeParsedDayPlan(parsed: unknown): DayPlanPayload | null {
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Record<string, unknown>;
  if (p.version !== 1 && p.version !== "1") return null;
  if (typeof p.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(p.date.trim())) return null;
  if (!Array.isArray(p.items) || p.items.length === 0) return null;

  let travelMode: DayPlanPayload["travelMode"] = "walking";
  const tm = p.travelMode;
  if (tm === "driving" || tm === "walking" || tm === "cycling") travelMode = tm;
  else if (typeof tm === "string") {
    const s = tm.toLowerCase();
    if (s.includes("cycl") || s.includes("bici") || s.includes("bike")) travelMode = "cycling";
    else if (s.includes("drive") || s.includes("coche") || s.includes("car")) travelMode = "driving";
  }

  const items: DayPlanItem[] = [];
  for (const raw of p.items) {
    if (!raw || typeof raw !== "object") continue;
    const it = raw as Record<string, unknown>;
    const title =
      typeof it.title === "string"
        ? it.title.trim()
        : typeof it.name === "string"
          ? it.name.trim()
          : "";
    if (!title) continue;
    const ks = typeof it.kind === "string" ? it.kind : "";
    const kind = normalizeItemKind(ks, title);
    let query = typeof it.query === "string" ? it.query.trim() || null : null;
    if (!query && typeof it.place === "string") query = it.place.trim() || null;
    const startTime = padHhMm(
      typeof it.startTime === "string"
        ? it.startTime
        : typeof it.time === "string"
          ? it.time
          : typeof it.start_time === "string"
            ? it.start_time
            : null
    );
    let durationMinutes =
      typeof it.durationMinutes === "number" && Number.isFinite(it.durationMinutes)
        ? Math.round(it.durationMinutes)
        : typeof it.duration_minutes === "number"
          ? Math.round(it.duration_minutes)
          : 45;
    durationMinutes = Math.max(15, Math.min(480, durationMinutes));
    const ticketRequired = Boolean(it.ticketRequired ?? it.ticket_required);
    const notes =
      typeof it.notes === "string"
        ? it.notes.trim() || null
        : typeof it.description === "string"
          ? it.description.trim() || null
          : null;
    items.push({ title, kind, query, startTime, durationMinutes, ticketRequired, notes });
  }
  if (!items.length) return null;

  const cityHint = typeof p.cityHint === "string" ? p.cityHint.trim() || null : null;
  const dayStart = padHhMm(typeof p.dayStart === "string" ? p.dayStart : null);
  const dayEnd = padHhMm(typeof p.dayEnd === "string" ? p.dayEnd : null);

  return {
    version: 1,
    date: p.date.trim(),
    cityHint,
    travelMode,
    dayStart,
    dayEnd,
    items,
  };
}

function inferDateFromHint(hintText: string): string | null {
  const m = hintText.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  return m ? m[1] : null;
}

/** Fechas tipo "1 de junio de 2026" o "01/06/2026" en contexto hispano. */
function inferDateLoose(hintText: string): string | null {
  const iso = inferDateFromHint(hintText);
  if (iso) return iso;

  const months: Record<string, string> = {
    enero: "01",
    febrero: "02",
    marzo: "03",
    abril: "04",
    mayo: "05",
    junio: "06",
    julio: "07",
    agosto: "08",
    septiembre: "09",
    setiembre: "09",
    octubre: "10",
    noviembre: "11",
    diciembre: "12",
  };
  const m = hintText.match(/\b(\d{1,2})\s+de\s+([a-záéíóúñ]+)(?:\s+de\s+(\d{4}))?\b/i);
  if (m) {
    const mon = months[m[2].toLowerCase()];
    if (mon) {
      const d = String(Math.min(31, Math.max(1, parseInt(m[1], 10)))).padStart(2, "0");
      const y = typeof m[3] === "string" && /^\d{4}$/.test(m[3]) ? m[3] : String(new Date().getUTCFullYear());
      return `${y}-${mon}-${d}`;
    }
  }

  const slash = hintText.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (slash) {
    const day = parseInt(slash[1], 10);
    const month = parseInt(slash[2], 10);
    const yRaw = slash[3] ? String(slash[3]) : "";
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const year = /^\d{4}$/.test(y) ? y : String(new Date().getUTCFullYear());
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  return null;
}

function addDaysIso(baseIso: string, addDays: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(baseIso)) return null;
  const d = new Date(`${baseIso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + addDays);
  return d.toISOString().slice(0, 10);
}

function expandIsoRange(startIso: string, endIso: string, cap = 14): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startIso) || !/^\d{4}-\d{2}-\d{2}$/.test(endIso)) return [];
  const a = new Date(`${startIso}T00:00:00.000Z`);
  const b = new Date(`${endIso}T00:00:00.000Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return [];
  const dir = a <= b ? 1 : -1;
  const out: string[] = [];
  const cur = new Date(a);
  for (let i = 0; i < cap; i++) {
    out.push(cur.toISOString().slice(0, 10));
    if (cur.toISOString().slice(0, 10) === b.toISOString().slice(0, 10)) break;
    cur.setUTCDate(cur.getUTCDate() + dir);
  }
  return out;
}

function wordToOrdinalDay(text: string): number | null {
  const t = text.toLowerCase();
  if (t.includes("primer") || t === "1") return 1;
  if (t.includes("segund") || t === "2") return 2;
  if (t.includes("tercer") || t === "3") return 3;
  if (t.includes("cuart") || t === "4") return 4;
  if (t.includes("quint") || t === "5") return 5;
  if (t.includes("sext") || t === "6") return 6;
  if (t.includes("sépt") || t.includes("sept") || t === "7") return 7;
  if (t.includes("octav") || t === "8") return 8;
  if (t.includes("noven") || t === "9") return 9;
  if (t.includes("décim") || t.includes("decim") || t === "10") return 10;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

function resolveRequestedDates(params: { hintText: string; tripStart: string | null; tripEnd: string | null }): string[] | null {
  const hint = params.hintText;
  const tripStart = params.tripStart;

  const ordMatch = hint.match(
    /\b(primer(?:o|a)?|segund(?:o|a)?|tercer(?:o|a)?|cuart(?:o|a)?|quint(?:o|a)?|sext(?:o|a)?|séptim(?:o|a)?|septim(?:o|a)?|octav(?:o|a)?|noven(?:o|a)?|décim(?:o|a)?|decim(?:o|a)?|\d{1,2})\s+d[ií]a\s+del\s+viaje\b/i
  );
  if (ordMatch && tripStart) {
    const n = wordToOrdinalDay(ordMatch[1]) ?? null;
    if (n && n >= 1 && n <= 90) {
      const iso = addDaysIso(tripStart, n - 1);
      if (iso) return [iso];
    }
  }

  const rangeMatch = hint.match(/\b(?:entre|del)\s+(.+?)\s+(?:y|al)\s+(.+?)\b/i);
  if (rangeMatch) {
    const a = inferDateLoose(rangeMatch[1]);
    const b = inferDateLoose(rangeMatch[2]);
    if (a && b) return expandIsoRange(a, b, 14);
  }

  const one = inferDateLoose(hint);
  return one ? [one] : null;
}

function compareActivityTime(a: unknown, b: unknown): number {
  const aa = typeof a === "string" ? a.trim() : "";
  const bb = typeof b === "string" ? b.trim() : "";
  if (!aa && !bb) return 0;
  if (!aa) return 1;
  if (!bb) return -1;
  return aa.localeCompare(bb);
}

function inferTravelModeFromHint(hintText: string): DayPlanPayload["travelMode"] {
  const h = hintText.toLowerCase();
  if (/\bbici\b|bicicleta|bicycle|cicl/.test(h)) return "cycling";
  if (/coche|driving|en coche|\bcar\b/.test(h)) return "driving";
  return "walking";
}

function inferDayStartEndFromHint(hintText: string, items: DayPlanItem[]): { dayStart: string | null; dayEnd: string | null } {
  const times = [...hintText.matchAll(/\b(\d{1,2}:\d{2})\b/g)]
    .map((x) => padHhMm(x[1]))
    .filter((x): x is string => Boolean(x));
  let dayStart = times[0] ?? null;
  let dayEnd = times.length > 1 ? times[times.length - 1]! : null;
  if (items[0]?.startTime) dayStart = dayStart ?? items[0].startTime;
  const last = items[items.length - 1];
  if (last?.startTime) dayEnd = dayEnd ?? last.startTime;
  return { dayStart, dayEnd };
}

function mapLooseScheduleRow(row: unknown): DayPlanItem | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  const title =
    typeof r.title === "string"
      ? r.title.trim()
      : typeof r.name === "string"
        ? r.name.trim()
        : "";
  if (!title) return null;
  const timeRaw =
    typeof r.time === "string"
      ? r.time
      : typeof r.startTime === "string"
        ? r.startTime
        : typeof r.start_time === "string"
          ? r.start_time
          : null;
  const startTime = padHhMm(timeRaw);
  let query =
    typeof r.query === "string"
      ? r.query.trim() || null
      : typeof r.place === "string"
        ? r.place.trim()
        : null;
  if (!query) query = title.length < 140 ? title : `${title.slice(0, 100)}`.trim();
  const notes =
    typeof r.description === "string"
      ? r.description.trim() || null
      : typeof r.notes === "string"
        ? r.notes.trim()
        : null;
  const kind =
    typeof r.kind === "string" ? normalizeItemKind(r.kind, title) : inferKindFromTitle(title);
  let durationMinutes =
    typeof r.durationMinutes === "number" && Number.isFinite(r.durationMinutes)
      ? Math.round(r.durationMinutes)
      : 45;
  durationMinutes = Math.max(15, Math.min(480, durationMinutes));
  const ticketRequired = Boolean(r.ticketRequired ?? r.ticket_required);
  return { title, kind, query, startTime, durationMinutes, ticketRequired, notes };
}

function coerceItemsArray(rows: unknown[]): DayPlanItem[] | null {
  const items = rows.map(mapLooseScheduleRow).filter(Boolean) as DayPlanItem[];
  return items.length ? items : null;
}

function tryCoerceFlexibleDayPlan(parsed: unknown, hintText: string): DayPlanPayload | null {
  let rows: unknown[] | null = null;
  if (Array.isArray(parsed)) {
    rows = parsed;
  } else if (parsed && typeof parsed === "object") {
    const o = parsed as Record<string, unknown>;
    const keys = ["items", "activities", "schedule", "stops", "plan", "itinerary", "events"] as const;
    for (const k of keys) {
      const v = o[k];
      if (Array.isArray(v) && v.length) {
        rows = v;
        break;
      }
    }
  }
  if (!rows) return null;
  const items = coerceItemsArray(rows);
  if (!items) return null;
  const rawDate =
    parsed && typeof parsed === "object" && typeof (parsed as Record<string, unknown>).date === "string"
      ? (parsed as Record<string, unknown>).date
      : null;
  const date = (typeof rawDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(rawDate.trim()) ? rawDate.trim() : null) || inferDateLoose(hintText);
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) return null;

  let travelMode: DayPlanPayload["travelMode"] = inferTravelModeFromHint(hintText);
  if (parsed && typeof parsed === "object") {
    const tm = (parsed as Record<string, unknown>).travelMode;
    if (tm === "driving" || tm === "walking" || tm === "cycling") travelMode = tm;
  }
  const { dayStart, dayEnd } = inferDayStartEndFromHint(hintText, items);
  let cityHint: string | null = null;
  if (parsed && typeof parsed === "object") {
    const ch = (parsed as Record<string, unknown>).cityHint;
    if (typeof ch === "string" && ch.trim()) cityHint = ch.trim();
  }
  if (!cityHint) {
    const m = hintText.match(/\b(?:en|En)\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+(?:\s+[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+){0,3})\b/);
    if (m) cityHint = m[1].trim();
  }

  return {
    version: 1,
    date: date.trim(),
    cityHint,
    travelMode,
    dayStart,
    dayEnd,
    items,
  };
}

function tryParseDayPlanJson(raw: string, hintText: string): DayPlanPayload | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    const n = normalizeParsedDayPlan(parsed);
    if (n) return n;
    return tryCoerceFlexibleDayPlan(parsed, hintText);
  } catch {
    try {
      if (trimmed.startsWith("[")) {
        const parsed = JSON.parse(trimmed);
        return tryCoerceFlexibleDayPlan(parsed, hintText);
      }
    } catch {
      return null;
    }
  }
  return null;
}

/** Busca el primer objeto JSON equilibrado que empieza en `openBrace`. */
function parseBalancedJsonFrom(text: string, openBrace: number): unknown | null {
  if (text[openBrace] !== "{") return null;
  let depth = 0;
  for (let i = openBrace; i < text.length; i++) {
    const c = text[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        const chunk = text.slice(openBrace, i + 1);
        try {
          return JSON.parse(chunk);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function parseBalancedArrayFrom(text: string, openBracket: number): unknown[] | null {
  if (text[openBracket] !== "[") return null;
  let depth = 0;
  for (let i = openBracket; i < text.length; i++) {
    const c = text[i];
    if (c === "[") depth++;
    else if (c === "]") {
      depth--;
      if (depth === 0) {
        try {
          const v = JSON.parse(text.slice(openBracket, i + 1));
          return Array.isArray(v) ? v : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function extractDayPlanFromLooseText(text: string, hintText: string): DayPlanPayload | null {
  let idx = 0;
  while (idx < text.length) {
    const v = text.indexOf('"version"', idx);
    if (v === -1) break;
    const open = text.lastIndexOf("{", v);
    if (open === -1 || open > v) {
      idx = v + 1;
      continue;
    }
    const parsed = parseBalancedJsonFrom(text, open);
    if (parsed) {
      const plan = normalizeParsedDayPlan(parsed) ?? tryCoerceFlexibleDayPlan(parsed, hintText);
      if (plan) return plan;
    }
    idx = v + 1;
  }

  let j = 0;
  while (j < text.length) {
    const ob = text.indexOf("[", j);
    if (ob === -1) break;
    const parsed = parseBalancedArrayFrom(text, ob);
    if (parsed && parsed.length > 0) {
      const plan = tryCoerceFlexibleDayPlan(parsed, hintText);
      if (plan) return plan;
    }
    j = ob + 1;
  }

  return null;
}

function extractDayPlan(text: string, hintText: string): DayPlanPayload | null {
  const start = "TRIPBOARD_DAYPLAN_JSON_START";
  const end = "TRIPBOARD_DAYPLAN_JSON_END";
  const iStart = text.indexOf(start);
  const iEnd = text.indexOf(end);
  if (iStart !== -1 && iEnd !== -1 && iEnd > iStart) {
    const raw = text.slice(iStart + start.length, iEnd).trim();
    const fromMarkers = tryParseDayPlanJson(raw, hintText);
    if (fromMarkers) return fromMarkers;
  }

  const fenceRe = /```(?:json)?\s*([\s\S]*?)\s*```/gi;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(text)) !== null) {
    const inner = m[1]?.trim() ?? "";
    if (inner.length < 5) continue;
    const plan = tryParseDayPlanJson(inner, hintText);
    if (plan) return plan;
  }

  return extractDayPlanFromLooseText(text, hintText);
}

function asProfile(mode: DayPlanPayload["travelMode"]) {
  if (mode === "walking") return "walking";
  if (mode === "cycling") return "cycling";
  return "driving";
}

function asTravelMode(mode: DayPlanPayload["travelMode"]): "DRIVING" | "WALKING" | "BICYCLING" {
  if (mode === "walking") return "WALKING";
  if (mode === "cycling") return "BICYCLING";
  return "DRIVING";
}

async function geocode(query: string) {
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "1");
  const resp = await fetch(url.toString(), { method: "GET", cache: "no-store" });
  const payload: any = await resp.json().catch(() => null);
  const feature = Array.isArray(payload?.features) ? payload.features[0] : null;
  const coords = feature?.geometry?.coordinates;
  const lng = Array.isArray(coords) ? Number(coords[0]) : null;
  const lat = Array.isArray(coords) ? Number(coords[1]) : null;
  return {
    lat: Number.isFinite(lat as any) ? (lat as number) : null,
    lng: Number.isFinite(lng as any) ? (lng as number) : null,
    label:
      (feature?.properties && typeof feature.properties === "object"
        ? [feature.properties.name, feature.properties.street, feature.properties.city, feature.properties.country]
            .filter(Boolean)
            .join(", ")
        : "") || null,
  };
}

async function wikidataOfficialWebsite(query: string): Promise<string | null> {
  // 1) search entity
  const searchUrl = new URL("https://www.wikidata.org/w/api.php");
  searchUrl.searchParams.set("action", "wbsearchentities");
  searchUrl.searchParams.set("format", "json");
  searchUrl.searchParams.set("language", "es");
  searchUrl.searchParams.set("uselang", "es");
  searchUrl.searchParams.set("limit", "1");
  searchUrl.searchParams.set("search", query);
  const searchResp = await fetch(searchUrl.toString(), { method: "GET", cache: "no-store" });
  const searchPayload: any = await searchResp.json().catch(() => null);
  const id = Array.isArray(searchPayload?.search) ? String(searchPayload.search?.[0]?.id || "") : "";
  if (!id) return null;

  // 2) entity data, property P856 (official website)
  const entityUrl = new URL("https://www.wikidata.org/w/api.php");
  entityUrl.searchParams.set("action", "wbgetentities");
  entityUrl.searchParams.set("format", "json");
  entityUrl.searchParams.set("ids", id);
  entityUrl.searchParams.set("props", "claims");
  const entityResp = await fetch(entityUrl.toString(), { method: "GET", cache: "no-store" });
  const entityPayload: any = await entityResp.json().catch(() => null);
  const claims = entityPayload?.entities?.[id]?.claims;
  const p856 = claims?.P856;
  const value =
    Array.isArray(p856) &&
    p856[0]?.mainsnak?.datavalue?.value &&
    typeof p856[0].mainsnak.datavalue.value === "string"
      ? String(p856[0].mainsnak.datavalue.value).trim()
      : "";
  return value && /^https?:\/\//i.test(value) ? value : null;
}

async function osrmRoute(params: {
  origin: string;
  originPoint: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  profile: "driving" | "walking" | "cycling";
}) {
  const url = new URL("/api/osrm/route", params.origin);
  // Llamamos al endpoint interno para mantener el formato normalizado.
  const resp = await fetch(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      origin: params.originPoint,
      destination: params.destination,
      profile: params.profile,
    }),
    cache: "no-store",
  });
  const payload = await resp.json().catch(() => null);
  if (!resp.ok) return { points: [], distanceMeters: null as number | null, durationSeconds: null as number | null };
  return {
    points: Array.isArray(payload?.points) ? payload.points : [],
    distanceMeters: typeof payload?.distanceMeters === "number" ? payload.distanceMeters : null,
    durationSeconds: typeof payload?.durationSeconds === "number" ? payload.durationSeconds : null,
  };
}

async function pickRestaurantNear(center: { lat: number; lng: number }) {
  const resp = await fetch("https://overpass-api.de/api/interpreter", {
    // Fallback: si quieres pasar por tu endpoint interno, usa origin relativo (ver abajo).
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: `data=${encodeURIComponent(
      `
[out:json][timeout:20];
(
  node["amenity"="restaurant"](around:1200,${center.lat},${center.lng});
  way["amenity"="restaurant"](around:1200,${center.lat},${center.lng});
  relation["amenity"="restaurant"](around:1200,${center.lat},${center.lng});
);
out center tags 40;
`.trim()
    )}`,
    cache: "no-store",
  });
  const payload = await resp.json().catch(() => null);
  const elements = Array.isArray(payload?.elements) ? payload.elements : [];
  const rows = elements
    .map((el: any) => {
      const tags = el?.tags && typeof el.tags === "object" ? el.tags : {};
      const name = typeof tags?.name === "string" ? tags.name.trim() : "";
      const website = typeof tags?.website === "string" ? tags.website.trim() : null;
      const lat = typeof el?.lat === "number" ? el.lat : typeof el?.center?.lat === "number" ? el.center.lat : null;
      const lng = typeof el?.lon === "number" ? el.lon : typeof el?.center?.lon === "number" ? el.center.lon : null;
      if (!name || lat == null || lng == null) return null;
      return { name, website, lat, lng };
    })
    .filter(Boolean) as Array<{ name: string; website: string | null; lat: number; lng: number }>;
  return rows[0] || null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const tripId = typeof body?.tripId === "string" ? body.tripId : "";
    const question = typeof body?.question === "string" ? body.question.trim() : "";
    const provider = typeof body?.provider === "string" ? body.provider : null;
    const origin = new URL(req.url).origin;

    const rawConv = body?.conversation;
    const conversation: ChatTurn[] = Array.isArray(rawConv)
      ? rawConv
          .map((row: unknown) => {
            if (!row || typeof row !== "object") return null;
            const r = row as Record<string, unknown>;
            const role = r.role === "user" || r.role === "assistant" ? r.role : null;
            const content = typeof r.content === "string" ? r.content : "";
            if (!role || !content.trim()) return null;
            return { role, content: content.slice(0, 4000) };
          })
          .filter(Boolean) as ChatTurn[]
      : [];
    const conversationSlice = conversation.slice(-16);

    if (!tripId) return NextResponse.json({ error: "Falta tripId" }, { status: 400 });
    if (!question) return NextResponse.json({ error: "Pregunta vacía" }, { status: 400 });

    const monthKey = monthKeyUtc();
    const budget = await enforceAiMonthlyBudgetOrThrow({ providerId: provider });
    const supabase = budget.supabase;
    const userId = budget.userId;

    const { data: participant } = await supabase
      .from("trip_participants")
      .select("id")
      .eq("trip_id", tripId)
      .eq("user_id", userId)
      .neq("status", "removed")
      .maybeSingle();
    if (!participant) return NextResponse.json({ error: "No tienes acceso a este viaje." }, { status: 403 });

    const isPremium = await isPremiumEnabledForTrip({ supabase, userId, tripId });
    if (!isPremium) {
      return NextResponse.json(
        { error: "Necesitas Premium (o un participante Premium en este viaje) para usar el asistente personal.", code: "PREMIUM_REQUIRED" },
        { status: 402 }
      );
    }

    const context = await buildTripContext(tripId);
    const { data: tripRow } = await supabase
      .from("trips")
      .select("start_date,end_date")
      .eq("id", tripId)
      .maybeSingle();
    const tripStart = typeof (tripRow as any)?.start_date === "string" ? String((tripRow as any).start_date) : null;
    const tripEnd = typeof (tripRow as any)?.end_date === "string" ? String((tripRow as any).end_date) : null;
    const historyBlock =
      conversationSlice.length > 0
        ? [
            "HISTORIAL RECIENTE (este hilo; el último mensaje USER es la petición actual):",
            conversationSlice.map((t) => `${t.role.toUpperCase()}: ${t.content}`).join("\n\n---\n\n"),
            "",
          ].join("\n")
        : "";

    const hintForDates = [question, ...conversationSlice.map((c) => c.content)].join("\n");
    const resolvedDates = resolveRequestedDates({ hintText: hintForDates, tripStart, tripEnd });
    const resolvedNote =
      resolvedDates && resolvedDates.length
        ? resolvedDates.length === 1
          ? `Fecha detectada por la app: ${resolvedDates[0]}.`
          : `Rango detectado por la app: ${resolvedDates[0]} → ${resolvedDates[resolvedDates.length - 1]} (${resolvedDates.length} días).`
        : "";

    // Si el usuario pide un rango de días, creamos rutas ENTRE planes existentes (sin inventar actividades).
    if (resolvedDates && resolvedDates.length > 1) {
      const tm = inferTravelModeFromHint(hintForDates);
      const travelMode = asTravelMode(tm);
      const profile = asProfile(tm);

      const { data: rawActs, error: actsErr } = await supabase
        .from("trip_activities")
        .select("id,title,activity_date,activity_time,place_name,address,latitude,longitude")
        .eq("trip_id", tripId)
        .in("activity_date", resolvedDates);
      if (actsErr) throw new Error(actsErr.message);

      const acts = Array.isArray(rawActs) ? rawActs : [];
      const byDate = new Map<string, any[]>();
      for (const a of acts) {
        const d = typeof a?.activity_date === "string" ? a.activity_date : null;
        if (!d) continue;
        const arr = byDate.get(d) || [];
        arr.push(a);
        byDate.set(d, arr);
      }

      const operations: any[] = [];
      const draftRoutes: RouteDraftPayload["routes"] = [];
      const missingCoords: Array<{ date: string; id: string; title: string }> = [];

      for (const date of resolvedDates) {
        const dayActs = (byDate.get(date) || []).slice();
        dayActs.sort(
          (x, y) =>
            compareActivityTime(x?.activity_time, y?.activity_time) ||
            String(x?.title || x?.place_name || "").localeCompare(String(y?.title || y?.place_name || ""))
        );

        for (const a of dayActs) {
          const lat = typeof a?.latitude === "number" ? a.latitude : null;
          const lng = typeof a?.longitude === "number" ? a.longitude : null;
          if (lat == null || lng == null) {
            const id = typeof a?.id === "string" ? a.id : String(a?.id || "");
            const title = String(a?.title || a?.place_name || "Plan").trim();
            if (id) missingCoords.push({ date, id, title });
          }
        }

        for (let i = 0; i < dayActs.length - 1; i++) {
          const a = dayActs[i];
          const b = dayActs[i + 1];
          const aLat = typeof a?.latitude === "number" ? a.latitude : null;
          const aLng = typeof a?.longitude === "number" ? a.longitude : null;
          const bLat = typeof b?.latitude === "number" ? b.latitude : null;
          const bLng = typeof b?.longitude === "number" ? b.longitude : null;
          if (aLat == null || aLng == null || bLat == null || bLng == null) continue;

          const route = await osrmRoute({
            origin,
            originPoint: { lat: aLat, lng: aLng },
            destination: { lat: bLat, lng: bLng },
            profile,
          });

          const title = `${String(a?.title || a?.place_name || "Origen").trim()} → ${String(
            b?.title || b?.place_name || "Destino"
          ).trim()}`;
          const distance_text =
            typeof route.distanceMeters === "number" ? `${(route.distanceMeters / 1000).toFixed(1)} km` : null;
          const duration_text =
            typeof route.durationSeconds === "number" ? `${Math.max(1, Math.round(route.durationSeconds / 60))} min` : null;

          const fields = {
            title,
            route_day: date,
            departure_time: null,
            travel_mode: travelMode,
            notes: null,
            origin_name: String(a?.title || a?.place_name || "Origen").trim(),
            origin_address: typeof a?.address === "string" ? a.address : null,
            origin_latitude: aLat,
            origin_longitude: aLng,
            destination_name: String(b?.title || b?.place_name || "Destino").trim(),
            destination_address: typeof b?.address === "string" ? b.address : null,
            destination_latitude: bLat,
            destination_longitude: bLng,
            path_points: route.points,
            route_points: route.points,
            distance_text,
            duration_text,
          };

          operations.push({ op: "create_route", fields });
          draftRoutes.push({
            title,
            route_day: date,
            departure_time: null,
            travel_mode: travelMode,
            origin_name: fields.origin_name,
            origin_address: fields.origin_address,
            origin_latitude: aLat,
            origin_longitude: aLng,
            destination_name: fields.destination_name,
            destination_address: fields.destination_address,
            destination_latitude: bLat,
            destination_longitude: bLng,
            path_points: route.points,
            route_points: route.points,
            distance_text,
            duration_text,
            notes: null,
          });
        }
      }

      const diff = {
        version: 1,
        title: `Rutas ${resolvedDates[0]} → ${resolvedDates[resolvedDates.length - 1]}`,
        operations,
      };

      const routesDraft: RouteDraftPayload = {
        version: 1,
        date: resolvedDates[0],
        travelMode,
        routes: draftRoutes,
      };

      const answer =
        `He preparado ${draftRoutes.length} ruta${draftRoutes.length === 1 ? "" : "s"} ` +
        `entre tus planes guardados para el rango ${resolvedDates[0]} → ${resolvedDates[resolvedDates.length - 1]}. ` +
        (missingCoords.length
          ? `\n\nOjo: hay ${missingCoords.length} plan${missingCoords.length === 1 ? "" : "es"} sin coordenadas; sin coords no puedo trazar rutas para esas paradas.`
          : "") +
        `\n\nPulsa «Revisar en Rutas» para validarlas y guardarlas.`;

      return NextResponse.json({ answer, plan: null, diff, routesDraft, missingCoords });
    }

    const prompt = [
      "Eres un asistente experto de viajes dentro de Kaviro.",
      "Responde siempre en español.",
      "Tu tarea es organizar UN día completo con tiempos y desplazamientos aproximados.",
      "",
      "REGLAS CRÍTICAS PARA EL JSON DEL DÍA:",
      "- La fecha puede venir como YYYY-MM-DD o en formato humano (ej. «10/11», «10 de noviembre», «día 2 del viaje»). Si está clara por el mensaje, el historial o el calendario del viaje, NO la vuelvas a pedir.",
      "- Si ya tienes fecha + ventana horaria + preferencia de transporte + intereses, DEBES generar EN ESTA MISMA RESPUESTA el plan en JSON con los marcadores literales TRIPBOARD_DAYPLAN_JSON_START y TRIPBOARD_DAYPLAN_JSON_END (sin envolverlos en ``` markdown).",
      "- Si el usuario da reglas mixtas (p. ej. andar si el tramo es corto y bici si es largo), elige travelMode \"cycling\" o \"walking\" según lo que predomine en el día y explica la regla en el texto humano antes del JSON.",
      "- travelMode debe ser exactamente uno de: driving | walking | cycling.",
      "- El JSON debe ser válido (comillas dobles, sin comentarios). Incluye al menos 4 items con query geocodable (nombre + ciudad).",
      "- Si aún faltan datos imprescindibles, haz solo preguntas breves y NO incluyas el bloque JSON todavía.",
      "",
      "Primero pregunta lo mínimo solo si faltan datos (fecha, transporte, horario, preferencias).",
      "Cuando tengas datos suficientes, devuelve el JSON DayPlan entre TRIPBOARD_DAYPLAN_JSON_START y TRIPBOARD_DAYPLAN_JSON_END (version 1, con date, travelMode, dayStart, dayEnd, items).",
      "",
      resolvedNote ? `NOTA DE LA APP: ${resolvedNote}` : "",
      historyBlock,
      "CONTEXTO DEL VIAJE:",
      context,
      "",
      "PETICIÓN / ÚLTIMO MENSAJE DEL USUARIO:",
      question,
      "",
      "RESPUESTA:",
    ].join("\n");

    const { text: answer, usage } = await askTripAIWithUsage(prompt, "planning", { provider });
    await trackAiUsage({
      supabase,
      userId,
      provider: (provider || process.env.AI_PROVIDER || "gemini").toLowerCase(),
      monthKey,
      usage,
    });

    const hintBlob = [question, ...conversationSlice.map((c) => c.content), answer.slice(0, 8000)].join("\n");
    const plan = extractDayPlan(answer, hintBlob);
    if (!plan) {
      const multiTurn = conversationSlice.length >= 2;
      const detailedAnswer = question.length > 40 || /\d{1,2}:\d{2}/.test(question);
      const dayPlannerHint =
        multiTurn && detailedAnswer
          ? "No se pudo leer el plan (falta una fecha YYYY-MM-DD en el hilo, el JSON está truncado o es inválido). Incluye la fecha del día en formato 2026-06-01 o pide: «plan del día con TRIPBOARD_DAYPLAN_JSON_START»."
          : null;
      return NextResponse.json({ answer, plan: null, diff: null, dayPlannerHint });
    }

    // Enrichment mínimo: geocode + restaurante real cercano + rutas OSRM entre items con coords.
    const enrichedItems: Array<
      DayPlanItem & { lat: number | null; lng: number | null; addressLabel: string | null; website: string | null }
    > = [];

    for (const item of plan.items) {
      const q = (item.query || "").trim();
      const geo = q ? await geocode(q) : { lat: null, lng: null, label: null };
      let website: string | null = null;
      let notes = item.notes;

      // Para restaurantes, si no trae query, buscamos uno cerca del punto previo.
      if (item.kind === "restaurant" && (!q || geo.lat == null || geo.lng == null)) {
        let prev: (typeof enrichedItems)[number] | null = null;
        for (let i = enrichedItems.length - 1; i >= 0; i--) {
          const cand = enrichedItems[i];
          if (cand?.lat != null && cand?.lng != null) {
            prev = cand;
            break;
          }
        }
        if (prev?.lat != null && prev?.lng != null) {
          const pick = await pickRestaurantNear({ lat: prev.lat, lng: prev.lng });
          if (pick) {
            enrichedItems.push({
              ...item,
              title: pick.name,
              query: pick.name,
              lat: pick.lat,
              lng: pick.lng,
              addressLabel: null,
              website: pick.website || null,
              notes,
            });
            continue;
          }
        }
      }

      // Para items con entrada: intentamos resolver web oficial (Wikidata P856).
      if (item.ticketRequired) {
        const hint = typeof plan.cityHint === "string" && plan.cityHint.trim() ? ` ${plan.cityHint.trim()}` : "";
        const official = await wikidataOfficialWebsite(`${item.title}${hint}`.trim()).catch(() => null);
        if (official) {
          const base = (notes || "").trim();
          notes = [base, `Necesita entrada. Web oficial: ${official}`].filter(Boolean).join("\n");
        } else {
          const base = (notes || "").trim();
          notes = [base, "Necesita entrada."].filter(Boolean).join("\n");
        }
      }

      enrichedItems.push({
        ...item,
        lat: geo.lat,
        lng: geo.lng,
        addressLabel: geo.label,
        website,
        notes,
      });
    }

    // Construimos un diff aplicable (create_activity + create_route)
    const operations: any[] = [];
    for (const it of enrichedItems) {
      operations.push({
        op: "create_activity",
        fields: {
          title: it.title,
          activity_kind: it.kind === "restaurant" ? "restaurant" : it.kind,
          activity_date: plan.date,
          activity_time: it.startTime,
          place_name: it.title,
          address: it.addressLabel,
          description: it.notes || null,
          latitude: it.lat,
          longitude: it.lng,
        },
      });
    }

    // Rutas consecutivas
    const profile = asProfile(plan.travelMode);
    const travelMode = asTravelMode(plan.travelMode);
    for (let i = 0; i < enrichedItems.length - 1; i++) {
      const a = enrichedItems[i];
      const b = enrichedItems[i + 1];
      if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) continue;
      const route = await osrmRoute({
        origin,
        originPoint: { lat: a.lat, lng: a.lng },
        destination: { lat: b.lat, lng: b.lng },
        profile,
      });
      operations.push({
        op: "create_route",
        fields: {
          title: `${a.title} → ${b.title}`,
          route_day: plan.date,
          departure_time: null,
          travel_mode: travelMode,
          notes: null,
          origin_name: a.title,
          origin_address: a.addressLabel,
          origin_latitude: a.lat,
          origin_longitude: a.lng,
          destination_name: b.title,
          destination_address: b.addressLabel,
          destination_latitude: b.lat,
          destination_longitude: b.lng,
          path_points: route.points,
          route_points: route.points,
          distance_text:
            typeof route.distanceMeters === "number"
              ? `${(route.distanceMeters / 1000).toFixed(1)} km`
              : null,
          duration_text:
            typeof route.durationSeconds === "number"
              ? `${Math.max(1, Math.round(route.durationSeconds / 60))} min`
              : null,
        },
      });
    }

    const diff = { version: 1, title: `Organizar día ${plan.date}`, operations };
    const routesDraft: RouteDraftPayload = {
      version: 1,
      date: plan.date,
      travelMode,
      routes: operations
        .filter((op: any) => op && op.op === "create_route" && op.fields && typeof op.fields === "object")
        .map((op: any) => {
          const f = op.fields || {};
          return {
            title: String(f.title || "").trim(),
            route_day: String(f.route_day || plan.date),
            departure_time: typeof f.departure_time === "string" ? f.departure_time : null,
            travel_mode: travelMode,
            origin_name: String(f.origin_name || "").trim(),
            origin_address: typeof f.origin_address === "string" ? f.origin_address : null,
            origin_latitude: typeof f.origin_latitude === "number" ? f.origin_latitude : null,
            origin_longitude: typeof f.origin_longitude === "number" ? f.origin_longitude : null,
            destination_name: String(f.destination_name || "").trim(),
            destination_address: typeof f.destination_address === "string" ? f.destination_address : null,
            destination_latitude: typeof f.destination_latitude === "number" ? f.destination_latitude : null,
            destination_longitude: typeof f.destination_longitude === "number" ? f.destination_longitude : null,
            path_points: Array.isArray(f.path_points) ? f.path_points : [],
            route_points: Array.isArray(f.route_points) ? f.route_points : [],
            distance_text: typeof f.distance_text === "string" ? f.distance_text : null,
            duration_text: typeof f.duration_text === "string" ? f.duration_text : null,
            notes: typeof f.notes === "string" ? f.notes : null,
          };
        })
        .filter((r: any) => r.title && r.origin_name && r.destination_name),
    };

    // Audit: guardamos una entrada resumen (no crea nada todavía; solo registra generación).
    await safeInsertAudit(supabase, {
      trip_id: tripId,
      entity_type: "ai_day_plan",
      entity_id: `${plan.date}`,
      action: "create",
      summary: `El asistente personal generó propuesta de día: ${plan.date}`,
      diff: { plan, items: enrichedItems },
      actor_user_id: userId,
      actor_email: null,
    });

    return NextResponse.json({ answer, plan, diff, routesDraft });
  } catch (e: any) {
    const status = typeof e?.httpStatus === "number" ? e.httpStatus : 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo organizar el día." },
      { status }
    );
  }
}

