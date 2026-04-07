import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";

function buildPayload(body: any) {
  return {
    trip_id: body?.tripId || body?.trip_id || null,
    route_day: body?.route_day || body?.route_date || body?.day_date || null,
    route_date: body?.route_date || body?.route_day || body?.day_date || null,
    day_date: body?.day_date || body?.route_date || body?.route_day || null,
    title: body?.title || body?.route_name || body?.name || null,
    route_name: body?.route_name || body?.title || body?.name || null,
    name: body?.name || body?.route_name || body?.title || null,
    departure_time: body?.departure_time || body?.start_time || null,
    start_time: body?.start_time || body?.departure_time || null,
    travel_mode: body?.travel_mode || body?.mode || "driving",
    mode: body?.mode || body?.travel_mode || "driving",
    notes: body?.notes || null,
    color: body?.color || null,
    route_order: typeof body?.route_order === "number" ? body.route_order : null,
    origin_name: body?.origin_name || null,
    origin_address: body?.origin_address || body?.origin_name || null,
    origin_latitude: body?.origin_latitude ?? null,
    origin_longitude: body?.origin_longitude ?? null,
    stop_name: body?.stop_name || null,
    stop_address: body?.stop_address || body?.stop_name || null,
    stop_latitude: body?.stop_latitude ?? null,
    stop_longitude: body?.stop_longitude ?? null,
    destination_name: body?.destination_name || null,
    destination_address: body?.destination_address || body?.destination_name || null,
    destination_latitude: body?.destination_latitude ?? null,
    destination_longitude: body?.destination_longitude ?? null,
    waypoints: Array.isArray(body?.waypoints) ? body.waypoints : [],
    path_points: Array.isArray(body?.path_points) ? body.path_points : [],
    route_points: Array.isArray(body?.route_points) ? body.route_points : [],
    distance_text: body?.distance_text || null,
    duration_text: body?.duration_text || null,
    arrival_time: body?.arrival_time || null,
  };
}

async function insertWithFallback(
  supabase: Awaited<ReturnType<typeof createClient>>,
  payload: Record<string, unknown>
) {
  let response = await supabase.from("trip_routes").insert(payload).select("*").single();
  if (!response.error) return response;

  const message = response.error.message.toLowerCase();
  if (message.includes("notes") && message.includes("schema cache")) {
    const { notes, ...fallbackPayload } = payload as any;
    response = await supabase.from("trip_routes").insert(fallbackPayload).select("*").single();
    return response;
  }

  if (!message.includes("route_order")) return response;

  const { route_order, ...fallbackPayload } = payload;
  response = await supabase.from("trip_routes").insert(fallbackPayload).select("*").single();
  return response;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const tripId = typeof body?.tripId === "string" ? body.tripId : body?.trip_id;

    if (!tripId) {
      return NextResponse.json({ error: "Falta tripId" }, { status: 400 });
    }

    await requireTripAccess(tripId);
    const supabase = await createClient();
    const payload = buildPayload(body);
    const response = await insertWithFallback(supabase, payload);

    if (response.error) throw new Error(response.error.message);

    return NextResponse.json({ route: response.data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo guardar la ruta." },
      { status: 500 }
    );
  }
}
