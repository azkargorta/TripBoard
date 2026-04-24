import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";
import { isPremiumEnabledForTrip } from "@/lib/entitlements";
import { fetchProjectOsrmRoute, type OsrmProfile } from "@/lib/osrm/projectOsrmRoute";

type DraftTravelMode = "DRIVING" | "WALKING" | "BICYCLING";

type RouteDraftPayload = {
  version: 1;
  date: string;
  travelMode: DraftTravelMode;
  routes: Array<{
    title: string;
    route_day: string;
    departure_time: string | null;
    travel_mode: DraftTravelMode;
    origin_name: string;
    origin_address: string | null;
    origin_latitude: number | null;
    origin_longitude: number | null;
    destination_name: string;
    destination_address: string | null;
    destination_latitude: number | null;
    destination_longitude: number | null;
    path_points: Array<{ lat: number; lng: number }>;
    route_points: Array<{ lat: number; lng: number }>;
    distance_text: string | null;
    duration_text: string | null;
    notes: string | null;
  }>;
};

function isIsoDate(s: unknown) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function listDatesInclusive(start: string, end: string) {
  const out: string[] = [];
  if (!isIsoDate(start) || !isIsoDate(end) || end < start) return out;
  let cur = start;
  while (cur <= end) {
    out.push(cur);
    const [yy, mm, dd] = cur.split("-").map(Number);
    const next = new Date(Date.UTC(yy, mm - 1, dd + 1));
    cur = next.toISOString().slice(0, 10);
  }
  return out;
}

function inferOsrmProfileFromText(text: string): OsrmProfile {
  const t = String(text || "").toLowerCase();
  if (/\b(pie|andar|andando|caminar|caminando|walk)\b/.test(t)) return "walking";
  if (/\b(bici|bicicleta|cycling|bike)\b/.test(t)) return "cycling";
  return "driving";
}

function toDraftMode(profile: OsrmProfile): DraftTravelMode {
  if (profile === "walking") return "WALKING";
  if (profile === "cycling") return "BICYCLING";
  return "DRIVING";
}

function formatKm(meters: number) {
  const km = meters / 1000;
  return km >= 10 ? `${km.toFixed(0)} km` : `${km.toFixed(1)} km`;
}

function formatDuration(seconds: number) {
  const m = Math.max(1, Math.round(seconds / 60));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm ? `${h}h ${mm}min` : `${h}h`;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as any;
    const tripId = typeof body?.tripId === "string" ? body.tripId : typeof body?.trip_id === "string" ? body.trip_id : "";
    const date = typeof body?.date === "string" ? body.date : "";
    const startDate = typeof body?.startDate === "string" ? body.startDate : typeof body?.start_date === "string" ? body.start_date : "";
    const endDate = typeof body?.endDate === "string" ? body.endDate : typeof body?.end_date === "string" ? body.end_date : "";
    const transportNotes = typeof body?.transportNotes === "string" ? body.transportNotes : "";
    const followUp = typeof body?.followUp === "string" ? body.followUp : "";

    if (!tripId) return NextResponse.json({ error: "Falta tripId" }, { status: 400 });

    const access = await requireTripAccess(tripId);
    if (!access.can_manage_map) {
      return NextResponse.json({ error: "No tienes permisos para crear rutas." }, { status: 403 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const userId = user?.id || null;
    if (!userId) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

    const isPremium = await isPremiumEnabledForTrip({ supabase, userId, tripId });
    if (!isPremium) {
      return NextResponse.json(
        { error: "Necesitas Premium (o un participante Premium en este viaje) para crear rutas automáticamente.", code: "PREMIUM_REQUIRED" },
        { status: 402 }
      );
    }

    const combined = `${transportNotes}\n${followUp}`.trim();
    if (!combined || combined.length < 3) {
      return NextResponse.json(
        {
          status: "needs_clarification",
          question:
            "¿Qué transporte quieres para las rutas? Por ejemplo: “a pie dentro de ciudad, metro si llueve, y tren entre ciudades” o “todo en coche”.",
        },
        { status: 200 }
      );
    }

    const resolvedDates = isIsoDate(date) ? [date] : listDatesInclusive(startDate, endDate);
    if (!resolvedDates.length) {
      return NextResponse.json({ error: "Faltan fechas válidas (date o startDate/endDate)." }, { status: 400 });
    }

    const profile = inferOsrmProfileFromText(combined);
    const travelMode = toDraftMode(profile);

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

    const draftRoutes: RouteDraftPayload["routes"] = [];
    const missingCoords: Array<{ date: string; id: string; title: string }> = [];

    for (const d of resolvedDates) {
      const dayActs = (byDate.get(d) || []).slice();
      dayActs.sort((x, y) => String(x?.activity_time || "").localeCompare(String(y?.activity_time || "")));

      for (const a of dayActs) {
        const lat = typeof a?.latitude === "number" ? a.latitude : null;
        const lng = typeof a?.longitude === "number" ? a.longitude : null;
        if (lat == null || lng == null) {
          const id = typeof a?.id === "string" ? a.id : String(a?.id || "");
          const title = String(a?.title || a?.place_name || "Plan").trim();
          if (id) missingCoords.push({ date: d, id, title });
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

        const oName = String(a?.title || a?.place_name || "Origen").trim() || "Origen";
        const dName = String(b?.title || b?.place_name || "Destino").trim() || "Destino";
        const title = `${oName} → ${dName}`;

        const osrm = await fetchProjectOsrmRoute({
          origin: { lat: aLat, lng: aLng },
          destination: { lat: bLat, lng: bLng },
          profile,
        });

        const points = Array.isArray(osrm.points) && osrm.points.length >= 2 ? osrm.points : [{ lat: aLat, lng: aLng }, { lat: bLat, lng: bLng }];
        const distance_text = typeof osrm.distanceMeters === "number" ? formatKm(osrm.distanceMeters) : null;
        const duration_text = typeof osrm.durationSeconds === "number" ? formatDuration(osrm.durationSeconds) : null;

        draftRoutes.push({
          title,
          route_day: d,
          departure_time: null,
          travel_mode: travelMode,
          origin_name: oName,
          origin_address: typeof a?.address === "string" ? a.address : null,
          origin_latitude: aLat,
          origin_longitude: aLng,
          destination_name: dName,
          destination_address: typeof b?.address === "string" ? b.address : null,
          destination_latitude: bLat,
          destination_longitude: bLng,
          path_points: points,
          route_points: points,
          distance_text,
          duration_text,
          notes: null,
        });
      }
    }

    const routesDraft: RouteDraftPayload = {
      version: 1,
      date: resolvedDates[0]!,
      travelMode,
      routes: draftRoutes,
    };

    return NextResponse.json({ status: "ok", routesDraft, missingCoords });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudieron generar las rutas." },
      { status: 500 }
    );
  }
}

