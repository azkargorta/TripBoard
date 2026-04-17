import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";
import { isPremiumEnabledForTrip } from "@/lib/entitlements";

export const runtime = "nodejs";
export const maxDuration = 60;

type DiffPayload = {
  version: 1;
  title?: string;
  operations: any[];
};

function asIsoDate(value: unknown) {
  const s = typeof value === "string" ? value.trim() : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function asTime(value: unknown) {
  const s = typeof value === "string" ? value.trim() : "";
  return /^(\d{1,2}):(\d{2})$/.test(s) ? s : null;
}

function asStringOrNull(value: unknown) {
  if (value === null) return null;
  if (typeof value === "string") return value.trim();
  return undefined;
}

function asNumberOrNull(value: unknown) {
  if (value === null) return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function normalizeTravelMode(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return null;
  const s = raw.toUpperCase();
  if (s === "DRIVING" || s === "WALKING" || s === "BICYCLING" || s === "TRANSIT") return s;
  const lower = raw.toLowerCase();
  if (lower === "driving" || lower === "car" || lower === "drive") return "DRIVING";
  if (lower === "walking" || lower === "walk" || lower === "foot") return "WALKING";
  if (lower === "cycling" || lower === "bicycle" || lower === "bike" || lower === "bicycling") return "BICYCLING";
  return null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const tripId = typeof body?.tripId === "string" ? body.tripId : "";
    const diff = body?.diff as DiffPayload | null;

    if (!tripId) return NextResponse.json({ error: "Falta tripId" }, { status: 400 });
    if (!diff || diff.version !== 1 || !Array.isArray(diff.operations)) {
      return NextResponse.json({ error: "Diff inválido." }, { status: 400 });
    }

    const access = await requireTripAccess(tripId);
    if (!access.can_manage_plan) {
      return NextResponse.json({ error: "No tienes permisos para aplicar cambios." }, { status: 403 });
    }

    const needsMap = diff.operations.some((opRaw: any) => {
      const op = typeof opRaw?.op === "string" ? opRaw.op : "";
      return op === "create_route" || op === "update_route";
    });
    if (needsMap && !access.can_manage_map) {
      return NextResponse.json(
        {
          error:
            "Este diff incluye rutas en el mapa. Necesitas permiso para gestionar el mapa del viaje (o pide a un editor con ese permiso que aplique los cambios).",
        },
        { status: 403 }
      );
    }

    const supabase = await createClient();
    const isPremium = await isPremiumEnabledForTrip({ supabase, userId: access.userId, tripId });
    if (!isPremium) {
      return NextResponse.json(
        { error: "Necesitas Premium (o un participante Premium en este viaje) para usar el asistente personal.", code: "PREMIUM_REQUIRED" },
        { status: 402 }
      );
    }
    const results: Array<{ ok: boolean; op: string; id?: string; error?: string }> = [];

    for (const opRaw of diff.operations) {
      const op = typeof opRaw?.op === "string" ? opRaw.op : "";
      try {
        if (op === "update_activity") {
          const id = typeof opRaw?.id === "string" ? opRaw.id : "";
          if (!id) throw new Error("Falta id.");
          const patchIn = opRaw?.patch || {};
          const patch: Record<string, unknown> = {};
          const assign = (k: string, v: unknown) => {
            if (v !== undefined) patch[k] = v;
          };
          assign("title", asStringOrNull(patchIn.title));
          assign("description", asStringOrNull(patchIn.description));
          assign("place_name", asStringOrNull(patchIn.place_name));
          assign("address", asStringOrNull(patchIn.address));
          assign("activity_kind", asStringOrNull(patchIn.activity_kind));
          assign("activity_date", patchIn.activity_date === null ? null : asIsoDate(patchIn.activity_date));
          assign("activity_time", patchIn.activity_time === null ? null : asTime(patchIn.activity_time));
          assign("latitude", asNumberOrNull(patchIn.latitude));
          assign("longitude", asNumberOrNull(patchIn.longitude));

          const { error } = await supabase.from("trip_activities").update(patch).eq("id", id).eq("trip_id", tripId);
          if (error) throw new Error(error.message);
          results.push({ ok: true, op, id });
          continue;
        }

        if (op === "create_activity") {
          const fieldsIn = opRaw?.fields || {};
          const title = typeof fieldsIn.title === "string" ? fieldsIn.title.trim() : "";
          if (!title) throw new Error("Falta title.");
          const payload = {
            trip_id: tripId,
            title,
            description: typeof fieldsIn.description === "string" ? fieldsIn.description.trim() : null,
            activity_date: fieldsIn.activity_date === null ? null : asIsoDate(fieldsIn.activity_date),
            activity_time: fieldsIn.activity_time === null ? null : asTime(fieldsIn.activity_time),
            place_name: typeof fieldsIn.place_name === "string" ? fieldsIn.place_name.trim() : null,
            address: typeof fieldsIn.address === "string" ? fieldsIn.address.trim() : null,
            latitude: asNumberOrNull(fieldsIn.latitude) ?? null,
            longitude: asNumberOrNull(fieldsIn.longitude) ?? null,
            activity_type: "general",
            activity_kind: typeof fieldsIn.activity_kind === "string" ? fieldsIn.activity_kind.trim() : null,
            source: "ai",
            created_by_user_id: access.userId,
          };
          const { data, error } = await supabase.from("trip_activities").insert(payload).select("id").single();
          if (error) throw new Error(error.message);
          results.push({ ok: true, op, id: String(data?.id || "") });
          continue;
        }

        if (op === "delete_activity") {
          const id = typeof opRaw?.id === "string" ? opRaw.id : "";
          if (!id) throw new Error("Falta id.");
          const { error } = await supabase.from("trip_activities").delete().eq("id", id).eq("trip_id", tripId);
          if (error) throw new Error(error.message);
          results.push({ ok: true, op, id });
          continue;
        }

        if (op === "update_route") {
          const id = typeof opRaw?.id === "string" ? opRaw.id : "";
          if (!id) throw new Error("Falta id.");
          const patchIn = opRaw?.patch || {};
          const patch: Record<string, unknown> = {};
          const assign = (k: string, v: unknown) => {
            if (v !== undefined) patch[k] = v;
          };
          assign("title", asStringOrNull(patchIn.title));
          assign("route_name", asStringOrNull(patchIn.title));
          assign("name", asStringOrNull(patchIn.title));
          assign("route_day", patchIn.route_day === null ? null : asIsoDate(patchIn.route_day));
          assign("route_date", patchIn.route_day === null ? null : asIsoDate(patchIn.route_day));
          assign("departure_time", patchIn.departure_time === null ? null : asTime(patchIn.departure_time));
          assign("travel_mode", normalizeTravelMode(patchIn.travel_mode));
          assign("mode", normalizeTravelMode(patchIn.travel_mode)?.toLowerCase());
          assign("notes", asStringOrNull(patchIn.notes));

          const { error } = await supabase.from("trip_routes").update(patch).eq("id", id).eq("trip_id", tripId);
          if (error) throw new Error(error.message);
          results.push({ ok: true, op, id });
          continue;
        }

        if (op === "create_route") {
          const fieldsIn = opRaw?.fields || {};
          const title = typeof fieldsIn.title === "string" ? fieldsIn.title.trim() : "";
          if (!title) throw new Error("Falta title.");
          const routeDay = fieldsIn.route_day === null ? null : asIsoDate(fieldsIn.route_day);
          const tm = normalizeTravelMode(fieldsIn.travel_mode) ?? "DRIVING";
          const payload = {
            trip_id: tripId,
            title,
            route_name: title,
            name: title,
            route_day: routeDay,
            route_date: routeDay,
            day_date: routeDay,
            departure_time: fieldsIn.departure_time === null ? null : asTime(fieldsIn.departure_time),
            travel_mode: tm,
            mode: tm.toLowerCase(),
            notes: asStringOrNull(fieldsIn.notes),
            color: typeof fieldsIn.color === "string" ? fieldsIn.color.trim() : null,
            origin_name: asStringOrNull(fieldsIn.origin_name),
            origin_address: asStringOrNull(fieldsIn.origin_address),
            origin_latitude: typeof fieldsIn.origin_latitude === "number" ? fieldsIn.origin_latitude : null,
            origin_longitude: typeof fieldsIn.origin_longitude === "number" ? fieldsIn.origin_longitude : null,
            destination_name: asStringOrNull(fieldsIn.destination_name),
            destination_address: asStringOrNull(fieldsIn.destination_address),
            destination_latitude: typeof fieldsIn.destination_latitude === "number" ? fieldsIn.destination_latitude : null,
            destination_longitude: typeof fieldsIn.destination_longitude === "number" ? fieldsIn.destination_longitude : null,
            stop_name: asStringOrNull(fieldsIn.stop_name),
            stop_address: asStringOrNull(fieldsIn.stop_address),
            stop_latitude: typeof fieldsIn.stop_latitude === "number" ? fieldsIn.stop_latitude : null,
            stop_longitude: typeof fieldsIn.stop_longitude === "number" ? fieldsIn.stop_longitude : null,
            waypoints: Array.isArray(fieldsIn.waypoints) ? fieldsIn.waypoints : [],
            path_points: Array.isArray(fieldsIn.path_points) ? fieldsIn.path_points : [],
            route_points: Array.isArray(fieldsIn.route_points) ? fieldsIn.route_points : [],
            distance_text: asStringOrNull(fieldsIn.distance_text),
            duration_text: asStringOrNull(fieldsIn.duration_text),
            arrival_time: asStringOrNull(fieldsIn.arrival_time),
            created_by_user_id: access.userId,
          };
          const { data, error } = await supabase.from("trip_routes").insert(payload).select("id").single();
          if (error) throw new Error(error.message);
          results.push({ ok: true, op, id: String(data?.id || "") });
          continue;
        }

        results.push({ ok: false, op: op || "unknown", error: "Operación no soportada." });
      } catch (e) {
        results.push({
          ok: false,
          op: op || "unknown",
          id: typeof opRaw?.id === "string" ? opRaw.id : undefined,
          error: e instanceof Error ? e.message : "Error aplicando operación.",
        });
      }
    }

    return NextResponse.json({
      ok: results.every((r) => r.ok),
      results,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo aplicar el diff." },
      { status: 500 }
    );
  }
}

