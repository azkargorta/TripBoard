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

type ChatTurn = { role: "user" | "assistant"; content: string };

function padHhMm(value: string | null | undefined): string | null {
  if (!value || typeof value !== "string") return null;
  const m = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Math.max(0, Math.min(23, Number(m[1])));
  const mm = Math.max(0, Math.min(59, Number(m[2])));
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function normalizeParsedDayPlan(parsed: unknown): DayPlanPayload | null {
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Record<string, unknown>;
  if (p.version !== 1) return null;
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
    const title = typeof it.title === "string" ? it.title.trim() : "";
    if (!title) continue;
    const ks = typeof it.kind === "string" ? it.kind.toLowerCase() : "visit";
    const kind: DayPlanItem["kind"] =
      ks === "restaurant" ? "restaurant" : ks === "museum" ? "museum" : ks === "activity" ? "activity" : "visit";
    const query = typeof it.query === "string" ? it.query.trim() || null : null;
    const startTime = padHhMm(typeof it.startTime === "string" ? it.startTime : null);
    let durationMinutes =
      typeof it.durationMinutes === "number" && Number.isFinite(it.durationMinutes)
        ? Math.round(it.durationMinutes)
        : 45;
    durationMinutes = Math.max(15, Math.min(480, durationMinutes));
    const ticketRequired = Boolean(it.ticketRequired);
    const notes = typeof it.notes === "string" ? it.notes.trim() || null : null;
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

function tryParseDayPlanJson(raw: string): DayPlanPayload | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return normalizeParsedDayPlan(JSON.parse(trimmed));
  } catch {
    return null;
  }
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

function extractDayPlanFromLooseText(text: string): DayPlanPayload | null {
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
    const plan = parsed ? normalizeParsedDayPlan(parsed) : null;
    if (plan) return plan;
    idx = v + 1;
  }
  return null;
}

function extractDayPlan(text: string): DayPlanPayload | null {
  const start = "TRIPBOARD_DAYPLAN_JSON_START";
  const end = "TRIPBOARD_DAYPLAN_JSON_END";
  const iStart = text.indexOf(start);
  const iEnd = text.indexOf(end);
  if (iStart !== -1 && iEnd !== -1 && iEnd > iStart) {
    const raw = text.slice(iStart + start.length, iEnd).trim();
    const fromMarkers = tryParseDayPlanJson(raw);
    if (fromMarkers) return fromMarkers;
  }

  const fenceRe = /```(?:json)?\s*([\s\S]*?)\s*```/gi;
  let m: RegExpExecArray | null;
  while ((m = fenceRe.exec(text)) !== null) {
    const inner = m[1]?.trim() ?? "";
    if (!inner.includes('"version"') || !inner.includes('"items"')) continue;
    const plan = tryParseDayPlanJson(inner);
    if (plan) return plan;
  }

  return extractDayPlanFromLooseText(text);
}

function asProfile(mode: DayPlanPayload["travelMode"]) {
  if (mode === "walking") return "walking";
  if (mode === "cycling") return "cycling";
  return "driving";
}

function asTravelMode(mode: DayPlanPayload["travelMode"]) {
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
        { error: "Necesitas Premium (o un participante Premium en este viaje) para usar la IA.", code: "PREMIUM_REQUIRED" },
        { status: 402 }
      );
    }

    const context = await buildTripContext(tripId);
    const historyBlock =
      conversationSlice.length > 0
        ? [
            "HISTORIAL RECIENTE (este hilo; el último mensaje USER es la petición actual):",
            conversationSlice.map((t) => `${t.role.toUpperCase()}: ${t.content}`).join("\n\n---\n\n"),
            "",
          ].join("\n")
        : "";

    const prompt = [
      "Eres un asistente experto de viajes dentro de Kaviro.",
      "Responde siempre en español.",
      "Tu tarea es organizar UN día completo con tiempos y desplazamientos aproximados.",
      "",
      "REGLAS CRÍTICAS PARA EL JSON DEL DÍA:",
      "- Si el usuario (o el historial) ya ha dado la FECHA del día (YYYY-MM-DD), horario aproximado de inicio y fin, cómo moverse y qué le apetece hacer, DEBES generar EN ESTA MISMA RESPUESTA el plan en JSON con los marcadores literales TRIPBOARD_DAYPLAN_JSON_START y TRIPBOARD_DAYPLAN_JSON_END (sin envolverlos en ``` markdown).",
      "- No pidas más confirmaciones si ya tienes fecha + ventana horaria + preferencia de transporte + intereses.",
      "- Si el usuario da reglas mixtas (p. ej. andar si el tramo es corto y bici si es largo), elige travelMode \"cycling\" o \"walking\" según lo que predomine en el día y explica la regla en el texto humano antes del JSON.",
      "- travelMode debe ser exactamente uno de: driving | walking | cycling.",
      "- El JSON debe ser válido (comillas dobles, sin comentarios). Incluye al menos 4 items con query geocodable (nombre + ciudad).",
      "- Si aún faltan datos imprescindibles (sobre todo la fecha en YYYY-MM-DD), haz solo preguntas breves y NO incluyas el bloque JSON todavía.",
      "",
      "Primero pregunta lo mínimo solo si faltan datos (fecha, transporte, horario, preferencias).",
      "Cuando tengas datos suficientes, devuelve el JSON DayPlan entre TRIPBOARD_DAYPLAN_JSON_START y TRIPBOARD_DAYPLAN_JSON_END (version 1, con date, travelMode, dayStart, dayEnd, items).",
      "",
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

    const plan = extractDayPlan(answer);
    if (!plan) {
      const multiTurn = conversationSlice.length >= 2;
      const detailedAnswer = question.length > 40 || /\d{1,2}:\d{2}/.test(question);
      const dayPlannerHint =
        multiTurn && detailedAnswer
          ? "No se pudo leer el plan en la respuesta de la IA (faltan los marcadores TRIPBOARD_DAYPLAN_JSON_START/END o el JSON es inválido). Prueba a escribir: «Genera ya el día con los marcadores TRIPBOARD_DAYPLAN_JSON» o divide tus respuestas en líneas (hora inicio, transporte, intereses, hora fin)."
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

    // Audit: guardamos una entrada resumen (no crea nada todavía; solo registra generación).
    await safeInsertAudit(supabase, {
      trip_id: tripId,
      entity_type: "ai_day_plan",
      entity_id: `${plan.date}`,
      action: "create",
      summary: `IA generó propuesta de día: ${plan.date}`,
      diff: { plan, items: enrichedItems },
      actor_user_id: userId,
      actor_email: null,
    });

    return NextResponse.json({ answer, plan, diff });
  } catch (e: any) {
    const status = typeof e?.httpStatus === "number" ? e.httpStatus : 500;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo organizar el día." },
      { status }
    );
  }
}

