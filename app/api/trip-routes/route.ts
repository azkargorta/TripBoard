import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";

async function safeInsertAudit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: {
    trip_id: string;
    entity_type: string;
    entity_id: string;
    action: "create" | "update" | "delete";
    summary?: string | null;
    diff?: any;
    actor_user_id?: string | null;
    actor_email?: string | null;
  }
) {
  try {
    await supabase.from("trip_audit_log").insert({
      trip_id: input.trip_id,
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      action: input.action,
      summary: input.summary ?? null,
      diff: input.diff ?? null,
      actor_user_id: input.actor_user_id ?? null,
      actor_email: input.actor_email ?? null,
    });
  } catch {
    // no-op
  }
}

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
  if (message.includes("color") && message.includes("schema cache")) {
    const { color, ...fallbackPayload } = payload as any;
    response = await supabase.from("trip_routes").insert(fallbackPayload).select("*").single();
    return response;
  }
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
    const { data: actor } = await supabase.auth.getUser();
    const payload = buildPayload(body);
    const response = await insertWithFallback(supabase, payload);

    if (response.error) throw new Error(response.error.message);

    await safeInsertAudit(supabase, {
      trip_id: tripId,
      entity_type: "route",
      entity_id: String(response.data.id),
      action: "create",
      summary: `Creó ruta: ${String(response.data.title || response.data.route_name || response.data.name || "").trim() || "Ruta"}`,
      diff: { after: response.data },
      actor_user_id: actor?.user?.id ?? null,
      actor_email: actor?.user?.email ?? null,
    });

    return NextResponse.json({ route: response.data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo guardar la ruta." },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tripId = searchParams.get("tripId");

    if (!tripId) {
      return NextResponse.json({ error: "Falta tripId" }, { status: 400 });
    }

    await requireTripAccess(tripId);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("trip_routes")
      .select("*")
      .eq("trip_id", tripId)
      .order("route_day", { ascending: true })
      .order("route_order", { ascending: true, nullsFirst: false })
      .order("departure_time", { ascending: true });

    if (error) throw new Error(error.message);

    return NextResponse.json({ routes: data || [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudieron cargar las rutas." },
      { status: 500 }
    );
  }
}
