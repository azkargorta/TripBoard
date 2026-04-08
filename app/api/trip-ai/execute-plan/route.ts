import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";

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

    const rows: Record<string, unknown>[] = [];
    for (const day of itinerary.days) {
      const date = typeof day?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day.date) ? day.date : null;
      const items = Array.isArray(day?.items) ? day.items : [];
      const itemsWithTimes = inferTimes(items);

      for (const item of itemsWithTimes) {
        const title = typeof item?.title === "string" ? item.title.trim() : "";
        if (!title) continue;

        const kindRaw = typeof item?.activity_kind === "string" ? item.activity_kind.trim().toLowerCase() : "visit";
        const activity_kind =
          kindRaw === "museum" || kindRaw === "restaurant" || kindRaw === "transport" || kindRaw === "activity" || kindRaw === "visit"
            ? kindRaw
            : "visit";

        rows.push({
          trip_id: tripId,
          title,
          description: typeof item?.notes === "string" ? item.notes.trim() : null,
          activity_date: date,
          activity_time: normalizeTime(item.start_time ?? null),
          place_name: typeof item?.place_name === "string" ? item.place_name.trim() : null,
          address: typeof item?.address === "string" ? item.address.trim() : null,
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

