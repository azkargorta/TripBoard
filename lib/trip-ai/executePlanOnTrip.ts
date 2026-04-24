import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExecutableItineraryPayload } from "@/lib/trip-ai/tripCreationTypes";
import { geocodePhotonPreferred, geocodeTripAnchor, regionHintsFromDestination } from "@/lib/geocoding/photonGeocode";
import { fetchProjectOsrmRoute } from "@/lib/osrm/projectOsrmRoute";

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
  const dest = typeof opts.tripDestination === "string" ? opts.tripDestination.trim() : "";
  const addr = typeof opts.address === "string" ? opts.address.trim() : "";
  const place = typeof opts.placeName === "string" ? opts.placeName.trim() : "";
  const parts: string[] = [];
  const seen = new Set<string>();
  const push = (s: string) => {
    const t = s.trim();
    if (!t) return;
    const k = t.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    parts.push(t);
  };
  // Destino primero: refuerza país/ciudad ante calles homónimas en otros países.
  push(dest);
  push(addr);
  push(place);
  if (!parts.length) return null;
  return parts.join(", ");
}

function validCoord(n: unknown) {
  return typeof n === "number" && Number.isFinite(n);
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLon / 2);
  const h = s1 * s1 + Math.cos(lat1) * Math.cos(lat2) * s2 * s2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

async function runWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  if (!items.length) return [];
  const results = new Array<R>(items.length);
  let next = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));
  const worker = async () => {
    while (true) {
      const idx = next++;
      if (idx >= items.length) break;
      results[idx] = await fn(items[idx]!, idx);
    }
  };
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
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

function straightLineFallback(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): { lat: number; lng: number }[] {
  return [
    { lat: a.lat, lng: a.lng },
    { lat: b.lat, lng: b.lng },
  ];
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
  access: ExecutePlanAccess;
  tripDestination: string | null;
  /** Si false, no genera rutas OSRM (solo actividades). */
  generateRoutes?: boolean;
}): Promise<
  | { ok: true; created: number; routesCreated: number; routesNote?: string }
  | { ok: false; error: string }
> {
  try {
    const { supabase, tripId, itinerary, conflictResolution, access, tripDestination } = params;
    const generateRoutes = params.generateRoutes !== false;

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

      if (generateRoutes && access.can_manage_map) {
        for (const d of uniqueItineraryDates) {
          const { error: r1 } = await supabase.from("trip_routes").delete().eq("trip_id", tripId).eq("route_day", d);
          if (r1) throw new Error(r1.message);
          const { error: r2 } = await supabase.from("trip_routes").delete().eq("trip_id", tripId).eq("route_date", d);
          if (r2) throw new Error(r2.message);
        }
      }
    }

    const geocodeCache = new Map<string, { latitude: number | null; longitude: number | null; formattedAddress?: string | null }>();
    let geocodeNetworkCalls = 0;
    const GEOCODE_NETWORK_LIMIT = 120;

    const anchor = await geocodeTripAnchor(tripDestination ?? null);
    const regionHints = regionHintsFromDestination(tripDestination ?? null);

    const slotMeta: SlotMeta[] = [];

    async function geocodeForItineraryItem(query: string): Promise<{ latitude: number | null; longitude: number | null; formattedAddress: string | null }> {
      if (!query.trim()) return { latitude: null, longitude: null, formattedAddress: null };
      const cached = geocodeCache.get(query);
      if (cached) {
        return {
          latitude: cached.latitude ?? null,
          longitude: cached.longitude ?? null,
          formattedAddress: cached.formattedAddress ?? null,
        };
      }
      if (geocodeNetworkCalls >= GEOCODE_NETWORK_LIMIT) {
        const miss = { latitude: null as number | null, longitude: null as number | null, formattedAddress: null as string | null };
        geocodeCache.set(query, miss);
        return miss;
      }

      const runOnce = async (q: string, opts: { anchor: { lat: number; lng: number } | null; maxDistanceKm: number }) => {
        geocodeNetworkCalls += 1;
        const g = await geocodePhotonPreferred(q, { anchor: opts.anchor, regionHints, maxDistanceKm: opts.maxDistanceKm });
        return g ? { lat: g.lat, lng: g.lng, label: g.label } : null;
      };

      // 1) Con ancla del destino (útil en ciudades únicas)
      let g = await runOnce(query, { anchor, maxDistanceKm: 4000 });
      // 2) Sin ancla: viajes multi-ciudad (p.ej. Croacia) — el ancla única puede estar a >380km y descartaba todo
      if (!g) g = await runOnce(query, { anchor: null, maxDistanceKm: 50000 });
      // 3) Refuerzo con país/destino explícito
      if (!g && tripDestination) {
        g = await runOnce(`${query}, ${tripDestination}`.trim(), { anchor: null, maxDistanceKm: 50000 });
      }

      const hit = {
        latitude: g ? g.lat : null,
        longitude: g ? g.lng : null,
        formattedAddress: g ? g.label : null,
      };
      geocodeCache.set(query, hit);
      return hit;
    }

    let created = 0;

    type PreparedRow = {
      date: string | null;
      item: ReturnType<typeof inferTimes>[number];
      title: string;
      place_name: string | null;
      address: string | null;
      activity_kind: string;
      latHint: number | null;
      lngHint: number | null;
    };

    const prepared: PreparedRow[] = [];
    for (const day of itinerary.days as ItineraryDay[]) {
      const date = typeof day?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day.date) ? day.date : null;
      const items = Array.isArray(day?.items) ? day.items : [];
      const itemsWithTimes = inferTimes(items).sort((a, b) => {
        const ta = normalizeTime((a as ItineraryItem).start_time ?? null) || "99:99";
        const tb = normalizeTime((b as ItineraryItem).start_time ?? null) || "99:99";
        return ta.localeCompare(tb);
      });

      for (const item of itemsWithTimes) {
        const title = typeof item?.title === "string" ? item.title.trim() : "";
        if (!title) continue;

        const place_name = typeof item?.place_name === "string" ? item.place_name.trim() : null;
        const address = typeof item?.address === "string" ? item.address.trim() : null;
        const activity_kind = normalizeKind(item?.activity_kind ?? null);
        const latHint = validCoord((item as any)?.latitude) ? Number((item as any).latitude) : null;
        const lngHint = validCoord((item as any)?.longitude) ? Number((item as any).longitude) : null;
        prepared.push({ date, item, title, place_name, address, activity_kind, latHint, lngHint });
      }
    }

    const GEOCODE_CONCURRENCY = 8;
    const geocoded = await runWithConcurrency(prepared, GEOCODE_CONCURRENCY, async (r) => {
      let normalizedAddress: string | null = r.address;
      const query = buildGeocodeQuery({ placeName: r.place_name, address: r.address, tripDestination });
      let latitude: number | null = null;
      let longitude: number | null = null;

      // Si la IA devolvió coordenadas, solo las aceptamos si están cerca del ancla del viaje.
      if (typeof r.latHint === "number" && typeof r.lngHint === "number") {
        const hinted = { lat: r.latHint, lng: r.lngHint };
        const dist = anchor ? haversineKm(anchor, hinted) : 0;
        // 650km es suficientemente amplio para viajes multi-ciudad dentro del país, pero evita saltos a otro país/continente.
        if (!anchor || dist <= 650) {
          latitude = hinted.lat;
          longitude = hinted.lng;
        }
      }

      if (query) {
        const geo = await geocodeForItineraryItem(query);
        latitude = geo.latitude ?? latitude;
        longitude = geo.longitude ?? longitude;
        if (geo.formattedAddress) normalizedAddress = geo.formattedAddress;
      }
      if ((latitude == null || longitude == null) && tripDestination) {
        const q2 = `${r.title}, ${tripDestination}`.trim();
        const geo2 = await geocodeForItineraryItem(q2);
        latitude = geo2.latitude ?? latitude;
        longitude = geo2.longitude ?? longitude;
        if (geo2.formattedAddress) normalizedAddress = geo2.formattedAddress;
      }
      return { ...r, normalizedAddress, latitude, longitude };
    });

    for (const r of geocoded) {
      const activity_time = normalizeTime(r.item.start_time ?? null);
      const row: Record<string, unknown> = {
        trip_id: tripId,
        title: r.title,
        description: typeof r.item?.notes === "string" ? r.item.notes.trim() : null,
        activity_date: r.date,
        activity_time,
        place_name: r.place_name,
        address: r.normalizedAddress,
        latitude: r.latitude,
        longitude: r.longitude,
        activity_type: "general",
        activity_kind: r.activity_kind,
        source: "ai",
        created_by_user_id: access.userId,
      };

      const { data: inserted, error } = await supabase.from("trip_activities").insert([row]).select("id").single();
      if (error) throw new Error(error.message);
      if (!inserted?.id) throw new Error("No se pudo crear una actividad del plan.");

      created += 1;

      slotMeta.push({
        route_day: r.date,
        title: r.title,
        place_name: r.place_name,
        addressLabel: r.normalizedAddress,
        latitude: r.latitude,
        longitude: r.longitude,
      });
    }

    if (!created) {
      return { ok: false, error: "No hay items válidos para crear." };
    }

    let routesCreated = 0;

    if (!generateRoutes) {
      return { ok: true, created, routesCreated: 0, routesNote: "Actividades creadas. La generación de rutas está desactivada." };
    }

    if (!access.can_manage_map) {
      return {
        ok: true,
        created,
        routesCreated: 0,
        routesNote:
          "Actividades creadas. Para generar también las rutas en el mapa necesitas permiso de gestión del mapa en este viaje.",
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

      const route = await fetchProjectOsrmRoute({
        origin: { lat: a.latitude, lng: a.longitude },
        destination: { lat: b.latitude, lng: b.longitude },
        profile,
      });
      routeCalls += 1;

      const originPt = { lat: a.latitude, lng: a.longitude };
      const destPt = { lat: b.latitude, lng: b.longitude };
      const rawPts = Array.isArray(route.points) ? route.points : [];
      const points = rawPts.length >= 2 ? rawPts : straightLineFallback(originPt, destPt);

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
        notes:
          rawPts.length >= 2
            ? null
            : "Geometría aproximada (línea recta): OSRM no devolvió trazado; revisa ferry/isla o modo de transporte.",
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
        path_points: points,
        route_points: points,
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
