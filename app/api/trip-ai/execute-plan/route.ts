import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";
import { isPremiumEnabledForTrip } from "@/lib/entitlements";

type ItineraryItem = {
  title: string;
  activity_kind?: string | null;
  place_name?: string | null;
  address?: string | null;
  start_time?: string | null;
  notes?: string | null;
};

type ItineraryDay = {
  day: number;
  date: string | null;
  items: ItineraryItem[];
};

type ItineraryPayload = {
  version: 1;
  title?: string;
  /** Perfil OSRM / modo de desplazamiento entre paradas (opcional; por defecto driving). */
  travelMode?: "driving" | "walking" | "cycling";
  days: ItineraryDay[];
};

type SlotMeta = {
  route_day: string | null;
  title: string;
  place_name: string | null;
  addressLabel: string | null;
  latitude: number | null;
  longitude: number | null;
};

function normalizeTime(input: string | null | undefined) {
  if (!input) return null;
  const m = String(input).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Math.max(0, Math.min(23, Number(m[1])));
  const mm = Math.max(0, Math.min(59, Number(m[2])));
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function inferTimes(items: ItineraryItem[]) {
  // Si faltan horas, asigna bloques típicos para mantener orden.
  const defaults = ["10:00", "12:30", "16:00", "19:30", "21:00"];
  let iDefault = 0;
  return items.map((item) => {
    const t = normalizeTime(item.start_time ?? null);
    if (t) return { ...item, start_time: t };
    const next = defaults[Math.min(iDefault, defaults.length - 1)];
    iDefault += 1;
    return { ...item, start_time: next };
  });
}

export const runtime = "nodejs";
export const maxDuration = 60;

function normalizeKind(input: string | null | undefined): string {
  const k = (input || "visit").trim().toLowerCase();
  if (k === "food" || k === "restaurant" || k === "eat") return "food";
  if (k === "transport" || k === "transit") return "transport";
  if (k === "lodging" || k === "hotel") return "lodging";
  if (k === "shopping") return "shopping";
  if (k === "nightlife") return "nightlife";
  if (k === "museum" || k === "activity" || k === "visit") return "visit";
  return "visit";
}

function buildGeocodeQuery(opts: { placeName: string | null; address: string | null; tripDestination: string | null }) {
  const parts = [opts.address, opts.placeName, opts.tripDestination].map((s) => (typeof s === "string" ? s.trim() : "")).filter(Boolean);
  if (!parts.length) return null;
  return parts.join(", ");
}

async function geocodeAddress(address: string): Promise<{ latitude: number | null; longitude: number | null; formattedAddress?: string | null }> {
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", address);
  url.searchParams.set("limit", "1");
  const response = await fetch(url.toString(), { method: "GET", cache: "no-store" });
  const payload: any = await response.json().catch(() => null);
  const feature = Array.isArray(payload?.features) ? payload.features[0] : null;
  const coords = feature?.geometry?.coordinates;
  const longitude = Array.isArray(coords) ? Number(coords[0]) : null;
  const latitude = Array.isArray(coords) ? Number(coords[1]) : null;
  const formattedAddress =
    (feature?.properties && typeof feature.properties === "object"
      ? [feature.properties.name, feature.properties.street, feature.properties.city, feature.properties.country]
          .filter(Boolean)
          .join(", ")
      : "") || null;
  if (!response.ok) return { latitude: null, longitude: null, formattedAddress: null };
  return {
    latitude: Number.isFinite(latitude as any) ? latitude : null,
    longitude: Number.isFinite(longitude as any) ? longitude : null,
    formattedAddress,
  };
}

function itineraryProfile(itinerary: ItineraryPayload): "driving" | "walking" | "cycling" {
  const m = itinerary.travelMode;
  if (m === "walking" || m === "cycling" || m === "driving") return m;
  return "driving";
}

function dbTravelMode(profile: "driving" | "walking" | "cycling") {
  if (profile === "walking") return { travel_mode: "WALKING" as const, mode: "walking" as const };
  if (profile === "cycling") return { travel_mode: "BICYCLING" as const, mode: "cycling" as const };
  return { travel_mode: "DRIVING" as const, mode: "driving" as const };
}

/** Misma tolerancia que POST /api/trip-routes (columnas opcionales / caché de esquema). */
async function insertTripRouteRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  payload: Record<string, unknown>
) {
  let response = await supabase.from("trip_routes").insert(payload).select("id").single();
  if (!response.error) return { ok: true as const, error: null as string | null };

  const message = response.error.message.toLowerCase();
  if (message.includes("color") && message.includes("schema cache")) {
    const { color: _c, ...fallbackPayload } = payload as Record<string, unknown> & { color?: unknown };
    response = await supabase.from("trip_routes").insert(fallbackPayload).select("id").single();
    if (!response.error) return { ok: true as const, error: null };
  }
  if (message.includes("notes") && message.includes("schema cache")) {
    const { notes: _n, ...fallbackPayload } = payload as Record<string, unknown> & { notes?: unknown };
    response = await supabase.from("trip_routes").insert(fallbackPayload).select("id").single();
    if (!response.error) return { ok: true as const, error: null };
  }
  if (message.includes("route_order")) {
    const { route_order: _ro, ...fallbackPayload } = payload as Record<string, unknown> & { route_order?: unknown };
    response = await supabase.from("trip_routes").insert(fallbackPayload).select("id").single();
    if (!response.error) return { ok: true as const, error: null };
  }
  return { ok: false as const, error: response.error.message };
}

async function fetchOsrmRoute(params: {
  requestOrigin: string;
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  profile: "driving" | "walking" | "cycling";
}) {
  const url = new URL("/api/osrm/route", params.requestOrigin);
  const resp = await fetch(url.toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      origin: params.origin,
      destination: params.destination,
      profile: params.profile,
    }),
    cache: "no-store",
  });
  const payload = await resp.json().catch(() => null);
  if (!resp.ok) {
    return { points: [] as { lat: number; lng: number }[], distanceMeters: null as number | null, durationSeconds: null as number | null };
  }
  return {
    points: Array.isArray(payload?.points) ? payload.points : [],
    distanceMeters: typeof payload?.distanceMeters === "number" ? payload.distanceMeters : null,
    durationSeconds: typeof payload?.durationSeconds === "number" ? payload.durationSeconds : null,
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const tripId = typeof body?.tripId === "string" ? body.tripId : "";
    const itinerary = body?.itinerary as ItineraryPayload | null;

    if (!tripId) return NextResponse.json({ error: "Falta tripId" }, { status: 400 });
    if (!itinerary || itinerary.version !== 1 || !Array.isArray(itinerary.days)) {
      return NextResponse.json({ error: "Itinerario inválido." }, { status: 400 });
    }

    const access = await requireTripAccess(tripId);
    if (!access.can_manage_plan) {
      return NextResponse.json({ error: "No tienes permisos para ejecutar el plan." }, { status: 403 });
    }

    const supabase = await createClient();

    // Premium required: IA + geocoding = coste. En plan gratis, 0 gasto.
    const isPremium = await isPremiumEnabledForTrip({ supabase, userId: access.userId, tripId });
    if (!isPremium) {
      return NextResponse.json(
        { error: "Necesitas Premium (o un participante Premium en este viaje) para usar la IA.", code: "PREMIUM_REQUIRED" },
        { status: 402 }
      );
    }

    const { data: tripRow } = await supabase.from("trips").select("destination").eq("id", tripId).single();
    const tripDestination = typeof tripRow?.destination === "string" ? tripRow.destination : null;

    const geocodeCache = new Map<string, { latitude: number | null; longitude: number | null; formattedAddress?: string | null }>();
    let geocodeCount = 0;
    const GEOCODE_LIMIT = 40; // evita tiempos largos/costes excesivos

    const rows: Record<string, unknown>[] = [];
    const slotMeta: SlotMeta[] = [];

    for (const day of itinerary.days) {
      const date = typeof day?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day.date) ? day.date : null;
      const items = Array.isArray(day?.items) ? day.items : [];
      const itemsWithTimes = inferTimes(items);

      for (const item of itemsWithTimes) {
        const title = typeof item?.title === "string" ? item.title.trim() : "";
        if (!title) continue;

        const place_name = typeof item?.place_name === "string" ? item.place_name.trim() : null;
        const address = typeof item?.address === "string" ? item.address.trim() : null;
        const activity_kind = normalizeKind(item?.activity_kind ?? null);

        let latitude: number | null = null;
        let longitude: number | null = null;
        let normalizedAddress: string | null = address;

        const query = buildGeocodeQuery({ placeName: place_name, address, tripDestination });
        if (query && geocodeCount < GEOCODE_LIMIT) {
          const cached = geocodeCache.get(query);
          const geo = cached ?? (await geocodeAddress(query));
          if (!cached) geocodeCache.set(query, geo);
          geocodeCount += 1;
          latitude = geo.latitude ?? null;
          longitude = geo.longitude ?? null;
          if (geo.formattedAddress) normalizedAddress = geo.formattedAddress;
        }

        rows.push({
          trip_id: tripId,
          title,
          description: typeof item?.notes === "string" ? item.notes.trim() : null,
          activity_date: date,
          activity_time: normalizeTime(item.start_time ?? null),
          place_name,
          address: normalizedAddress,
          latitude,
          longitude,
          activity_type: "general",
          activity_kind,
          source: "ai",
          created_by_user_id: access.userId,
        });

        slotMeta.push({
          route_day: date,
          title,
          place_name,
          addressLabel: normalizedAddress,
          latitude,
          longitude,
        });
      }
    }

    if (!rows.length) {
      return NextResponse.json({ error: "No hay items válidos para crear." }, { status: 400 });
    }

    const { data: insertedRows, error } = await supabase.from("trip_activities").insert(rows).select("id");
    if (error) throw new Error(error.message);

    const created = rows.length;
    let routesCreated = 0;

    if (!access.can_manage_map) {
      return NextResponse.json({
        ok: true,
        created,
        routesCreated: 0,
        routesNote:
          "Actividades creadas. Para generar también las rutas en el mapa necesitas permiso de gestión del mapa en este viaje.",
      });
    }

    if (!Array.isArray(insertedRows) || insertedRows.length !== rows.length) {
      return NextResponse.json({
        ok: true,
        created,
        routesCreated: 0,
        routesNote: "Actividades creadas, pero no se pudieron calcular rutas (respuesta de inserción incompleta).",
      });
    }

    const requestOrigin = new URL(req.url).origin;
    const profile = itineraryProfile(itinerary);
    const { travel_mode, mode } = dbTravelMode(profile);
    let routeCalls = 0;
    const ROUTE_CALL_LIMIT = 80;
    let lastRouteInsertError: string | null = null;

    for (let i = 0; i < slotMeta.length - 1; i++) {
      const a = slotMeta[i];
      const b = slotMeta[i + 1];
      if (a.route_day !== b.route_day) continue;
      if (a.latitude == null || a.longitude == null || b.latitude == null || b.longitude == null) continue;
      if (routeCalls >= ROUTE_CALL_LIMIT) break;

      const route = await fetchOsrmRoute({
        requestOrigin,
        origin: { lat: a.latitude, lng: a.longitude },
        destination: { lat: b.latitude, lng: b.longitude },
        profile,
      });
      routeCalls += 1;

      const title = `${a.title} → ${b.title}`;
      const routeDay = a.route_day;

      const payload: Record<string, unknown> = {
        trip_id: tripId,
        title,
        route_name: title,
        name: title,
        route_day: routeDay,
        route_date: routeDay,
        day_date: routeDay,
        departure_time: null,
        travel_mode,
        mode,
        notes: null,
        color: null,
        origin_name: a.title,
        origin_address: a.addressLabel,
        origin_latitude: a.latitude,
        origin_longitude: a.longitude,
        destination_name: b.title,
        destination_address: b.addressLabel,
        destination_latitude: b.latitude,
        destination_longitude: b.longitude,
        stop_name: null,
        stop_address: null,
        stop_latitude: null,
        stop_longitude: null,
        waypoints: [],
        path_points: route.points,
        route_points: route.points,
        distance_text:
          typeof route.distanceMeters === "number" ? `${(route.distanceMeters / 1000).toFixed(1)} km` : null,
        duration_text:
          typeof route.durationSeconds === "number" ? `${Math.max(1, Math.round(route.durationSeconds / 60))} min` : null,
        arrival_time: null,
        created_by_user_id: access.userId,
      };

      const ins = await insertTripRouteRow(supabase, payload);
      if (!ins.ok) {
        lastRouteInsertError = ins.error || "Error desconocido al guardar ruta.";
        console.error("[execute-plan] trip_routes insert:", lastRouteInsertError);
        continue;
      }
      routesCreated += 1;
    }

    return NextResponse.json({
      ok: true,
      created,
      routesCreated,
      ...(routesCreated === 0 && access.can_manage_map
        ? {
            routesNote: [
              "No se generaron rutas en el mapa: hace falta geolocalizar al menos dos paradas seguidas el mismo día, el cálculo OSRM falló, o la base de datos rechazó el guardado.",
              lastRouteInsertError ? `Detalle: ${lastRouteInsertError}` : "",
            ]
              .filter(Boolean)
              .join(" "),
          }
        : {}),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo ejecutar el plan." },
      { status: 500 }
    );
  }
}
