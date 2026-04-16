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

function extractDayPlan(text: string): DayPlanPayload | null {
  const start = "TRIPBOARD_DAYPLAN_JSON_START";
  const end = "TRIPBOARD_DAYPLAN_JSON_END";
  const iStart = text.indexOf(start);
  const iEnd = text.indexOf(end);
  if (iStart === -1 || iEnd === -1 || iEnd <= iStart) return null;
  const raw = text.slice(iStart + start.length, iEnd).trim();
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1) return null;
    if (typeof parsed.date !== "string") return null;
    if (!Array.isArray(parsed.items)) return null;
    return parsed as DayPlanPayload;
  } catch {
    return null;
  }
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
    const prompt = [
      "Eres un asistente experto de viajes dentro de Kaviro.",
      "Responde siempre en español.",
      "Tu tarea es organizar UN día completo con tiempos y desplazamientos aproximados.",
      "Primero pregunta lo mínimo si faltan datos (fecha, transporte, horario, preferencias).",
      "Cuando tengas datos suficientes, devuelve un JSON DayPlan entre marcadores TRIPBOARD_DAYPLAN_JSON_START/END siguiendo el esquema version 1.",
      "",
      "CONTEXTO DEL VIAJE:",
      context,
      "",
      "PETICIÓN DEL USUARIO:",
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
      return NextResponse.json({ answer, plan: null, diff: null });
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

