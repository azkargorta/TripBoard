import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExecutableItineraryPayload } from "@/lib/trip-ai/tripCreationTypes";

type ItineraryItem = ExecutableItineraryPayload["days"][number]["items"][number];
type ItineraryDay = ExecutableItineraryPayload["days"][number];
type ItineraryPayload = ExecutableItineraryPayload;

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

async function insertTripRouteRow(supabase: SupabaseClient, payload: Record<string, unknown>) {
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

export type ExecutePlanAccess = {
  userId: string;
  can_manage_map: boolean;
};

/**
 * Inserta actividades (y rutas OSRM si aplica) a partir de un itinerario ejecutable.
 * Reutilizado por POST /api/trip-ai/execute-plan y por la creación automática de viaje.
 */
export async function executePlanOnTrip(params: {
  supabase: SupabaseClient;
  tripId: string;
  itinerary: ExecutableItineraryPayload;
  conflictResolution: "replace" | "add";
  requestOrigin: string;
  access: ExecutePlanAccess;
  tripDestination: string | null;
}): Promise<
  | { ok: true; created: number; routesCreated: number; routesNote?: string }
  | { ok: false; error: string }
> {
  try {
    const { supabase, tripId, itinerary, conflictResolution, requestOrigin, access, tripDestination } = params;

    const itineraryDates: string[] = [];
    for (const day of itinerary.days) {
      const d = typeof day?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day.date) ? day.date : null;
      if (d) itineraryDates.push(d);
    }
    const uniqueItineraryDates = Array.from(new Set(itineraryDates));

    if (conflictResolution === "replace" && uniqueItineraryDates.length) {
      const { error: delActErr } = await supabase
        .from("trip_activities")
        .delete()
        .eq("trip_id", tripId)
        .in("activity_date", uniqueItineraryDates)
        .is("linked_reservation_id", null);
      if (delActErr) throw new Error(delActErr.message);

      if (access.can_manage_map) {
        for (const d of uniqueItineraryDates) {
          const { error: r1 } = await supabase.from("trip_routes").delete().eq("trip_id", tripId).eq("route_day", d);
          if (r1) throw new Error(r1.message);
          const { error: r2 } = await supabase.from("trip_routes").delete().eq("trip_id", tripId).eq("route_date", d);
          if (r2) throw new Error(r2.message);
        }
      }
    }

    const geocodeCache = new Map<string, { latitude: number | null; longitude: number | null; formattedAddress?: string | null }>();
    let geocodeCount = 0;
    const GEOCODE_LIMIT = 40;

    const rows: Record<string, unknown>[] = [];
    const slotMeta: SlotMeta[] = [];

    for (const day of itinerary.days as ItineraryDay[]) {
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
      return { ok: false, error: "No hay items válidos para crear." };
    }

    const { data: insertedRows, error } = await supabase.from("trip_activities").insert(rows).select("id");
    if (error) throw new Error(error.message);

    const created = rows.length;
    let routesCreated = 0;

    if (!access.can_manage_map) {
      return {
        ok: true,
        created,
        routesCreated: 0,
        routesNote:
          "Actividades creadas. Para generar también las rutas en el mapa necesitas permiso de gestión del mapa en este viaje.",
      };
    }

    if (!Array.isArray(insertedRows) || insertedRows.length !== rows.length) {
      return {
        ok: true,
        created,
        routesCreated: 0,
        routesNote: "Actividades creadas, pero no se pudieron calcular rutas (respuesta de inserción incompleta).",
      };
    }

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
        console.error("[executePlanOnTrip] trip_routes insert:", lastRouteInsertError);
        continue;
      }
      routesCreated += 1;
    }

    const routesNote =
      routesCreated === 0 && access.can_manage_map
        ? [
            "No se generaron rutas en el mapa: hace falta geolocalizar al menos dos paradas seguidas el mismo día, el cálculo OSRM falló, o la base de datos rechazó el guardado.",
            lastRouteInsertError ? `Detalle: ${lastRouteInsertError}` : "",
          ]
            .filter(Boolean)
            .join(" ")
        : undefined;

    return { ok: true, created, routesCreated, ...(routesNote ? { routesNote } : {}) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No se pudo ejecutar el plan." };
  }
}
