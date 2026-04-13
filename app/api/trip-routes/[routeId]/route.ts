import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";
import { isPremiumEnabledForTrip } from "@/lib/entitlements";

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

function buildPatchPayload(body: any) {
  const payload: Record<string, unknown> = {};
  const assign = (key: string, value: unknown) => {
    if (value !== undefined) payload[key] = value;
  };

  assign("route_day", body?.route_day ?? body?.route_date ?? body?.day_date);
  assign("route_date", body?.route_date ?? body?.route_day ?? body?.day_date);
  assign("day_date", body?.day_date ?? body?.route_date ?? body?.route_day);
  assign("title", body?.title ?? body?.route_name ?? body?.name);
  assign("route_name", body?.route_name ?? body?.title ?? body?.name);
  assign("name", body?.name ?? body?.route_name ?? body?.title);
  assign("departure_time", body?.departure_time ?? body?.start_time);
  assign("start_time", body?.start_time ?? body?.departure_time);
  assign("travel_mode", body?.travel_mode ?? body?.mode);
  assign("mode", body?.mode ?? body?.travel_mode);
  assign("notes", body?.notes);
  assign("color", body?.color);
  assign("route_order", body?.route_order);
  assign("origin_name", body?.origin_name);
  assign("origin_address", body?.origin_address);
  assign("origin_latitude", body?.origin_latitude);
  assign("origin_longitude", body?.origin_longitude);
  assign("stop_name", body?.stop_name);
  assign("stop_address", body?.stop_address);
  assign("stop_latitude", body?.stop_latitude);
  assign("stop_longitude", body?.stop_longitude);
  assign("destination_name", body?.destination_name);
  assign("destination_address", body?.destination_address);
  assign("destination_latitude", body?.destination_latitude);
  assign("destination_longitude", body?.destination_longitude);
  assign("waypoints", Array.isArray(body?.waypoints) ? body.waypoints : body?.waypoints);
  assign("path_points", Array.isArray(body?.path_points) ? body.path_points : body?.path_points);
  assign("route_points", Array.isArray(body?.route_points) ? body.route_points : body?.route_points);
  assign("distance_text", body?.distance_text);
  assign("duration_text", body?.duration_text);
  assign("arrival_time", body?.arrival_time);

  return payload;
}

async function patchWithFallback(
  supabase: Awaited<ReturnType<typeof createClient>>,
  routeId: string,
  payload: Record<string, unknown>
) {
  let response = await supabase.from("trip_routes").update(payload).eq("id", routeId).select("*").single();
  if (!response.error) return response;

  const message = response.error.message.toLowerCase();
  if (message.includes("color") && message.includes("schema cache")) {
    const { color, ...fallbackPayload } = payload as any;
    response = await supabase.from("trip_routes").update(fallbackPayload).eq("id", routeId).select("*").single();
    return response;
  }
  if (message.includes("notes") && message.includes("schema cache")) {
    const { notes, ...fallbackPayload } = payload as any;
    response = await supabase.from("trip_routes").update(fallbackPayload).eq("id", routeId).select("*").single();
    return response;
  }
  if (!message.includes("route_order")) return response;

  const { route_order, ...fallbackPayload } = payload;
  response = await supabase.from("trip_routes").update(fallbackPayload).eq("id", routeId).select("*").single();
  return response;
}

export async function PATCH(request: Request, { params }: { params: { routeId: string } }) {
  try {
    const body = await request.json();
    const payload = buildPatchPayload(body);
    const supabase = await createClient();
    const { data: actor } = await supabase.auth.getUser();

    // Verifica acceso al viaje asociado a la ruta (y evita updates sin permiso).
    const { data: routeRow, error: routeError } = await supabase
      .from("trip_routes")
      .select("*")
      .eq("id", params.routeId)
      .maybeSingle();
    if (routeError) throw new Error(routeError.message);
    if (!routeRow?.trip_id) {
      return NextResponse.json({ error: "Ruta no encontrada." }, { status: 404 });
    }
    await requireTripAccess(routeRow.trip_id);

    const actorId = actor?.user?.id || "";
    const isPremium = actorId
      ? await isPremiumEnabledForTrip({ supabase, userId: actorId, tripId: String(routeRow.trip_id) })
      : false;

    if (!isPremium) {
      // Free tier: no coordenadas / no puntos de ruta. Mantiene campos manuales.
      delete (payload as any).origin_latitude;
      delete (payload as any).origin_longitude;
      delete (payload as any).stop_latitude;
      delete (payload as any).stop_longitude;
      delete (payload as any).destination_latitude;
      delete (payload as any).destination_longitude;
      if ("path_points" in payload) (payload as any).path_points = [];
      if ("route_points" in payload) (payload as any).route_points = [];
      if ("distance_text" in payload) (payload as any).distance_text = null;
    }

    const response = await patchWithFallback(supabase, params.routeId, payload);

    if (response.error) throw new Error(response.error.message);

    await safeInsertAudit(supabase, {
      trip_id: String(routeRow.trip_id),
      entity_type: "route",
      entity_id: String(response.data.id),
      action: "update",
      summary: `Actualizó ruta: ${String(response.data.title || response.data.route_name || response.data.name || "").trim() || "Ruta"}`,
      diff: { before: routeRow, patch: payload, after: response.data },
      actor_user_id: actor?.user?.id ?? null,
      actor_email: actor?.user?.email ?? null,
    });

    return NextResponse.json({ route: response.data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo actualizar la ruta." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { routeId: string } }
) {
  try {
    const supabase = await createClient();
    const { data: actor } = await supabase.auth.getUser();

    const { data: routeRow, error: routeError } = await supabase
      .from("trip_routes")
      .select("*")
      .eq("id", params.routeId)
      .maybeSingle();
    if (routeError) throw new Error(routeError.message);
    if (!routeRow?.trip_id) {
      return NextResponse.json({ error: "Ruta no encontrada." }, { status: 404 });
    }
    await requireTripAccess(routeRow.trip_id);

    const response = await supabase.from("trip_routes").delete().eq("id", params.routeId);
    if (response.error) throw new Error(response.error.message);

    await safeInsertAudit(supabase, {
      trip_id: String(routeRow.trip_id),
      entity_type: "route",
      entity_id: String(routeRow.id),
      action: "delete",
      summary: `Eliminó ruta: ${String((routeRow as any).title || (routeRow as any).route_name || (routeRow as any).name || "").trim() || "Ruta"}`,
      diff: { before: routeRow },
      actor_user_id: actor?.user?.id ?? null,
      actor_email: actor?.user?.email ?? null,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo eliminar la ruta." },
      { status: 500 }
    );
  }
}
