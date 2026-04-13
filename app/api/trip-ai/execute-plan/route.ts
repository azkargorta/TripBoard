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
  days: ItineraryDay[];
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

async function geocodeAddress(address: string, apiKey: string): Promise<{ latitude: number | null; longitude: number | null; formattedAddress?: string | null }> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", address);
  url.searchParams.set("key", apiKey);
  const response = await fetch(url.toString(), { method: "GET", cache: "no-store" });
  const payload: any = await response.json().catch(() => null);
  if (!response.ok || payload?.status !== "OK" || !payload?.results?.length) {
    return { latitude: null, longitude: null, formattedAddress: null };
  }
  const first = payload.results[0];
  const location = first?.geometry?.location;
  return { latitude: location?.lat ?? null, longitude: location?.lng ?? null, formattedAddress: first?.formatted_address ?? null };
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
    if (access.role === "viewer") {
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

    const apiKey =
      process.env.GOOGLE_MAPS_API_KEY ||
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
      "";

    const geocodeCache = new Map<string, { latitude: number | null; longitude: number | null; formattedAddress?: string | null }>();
    let geocodeCount = 0;
    const GEOCODE_LIMIT = 40; // evita tiempos largos/costes excesivos

    const rows: Record<string, unknown>[] = [];
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
        if (apiKey && query && geocodeCount < GEOCODE_LIMIT) {
          const cached = geocodeCache.get(query);
          const geo = cached ?? (await geocodeAddress(query, apiKey));
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
      }
    }

    if (!rows.length) {
      return NextResponse.json({ error: "No hay items válidos para crear." }, { status: 400 });
    }

    const { error } = await supabase.from("trip_activities").insert(rows);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, created: rows.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo ejecutar el plan." },
      { status: 500 }
    );
  }
}

