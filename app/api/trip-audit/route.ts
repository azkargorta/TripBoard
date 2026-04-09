import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tripId = searchParams.get("tripId");
    const entityType = searchParams.get("entityType");
    const entityId = searchParams.get("entityId");
    const limitRaw = searchParams.get("limit");
    const limit = Math.min(Math.max(Number(limitRaw || "30"), 1), 200);

    if (!tripId) return NextResponse.json({ error: "Falta tripId" }, { status: 400 });

    await requireTripAccess(tripId);
    const supabase = await createClient();

    let query = supabase
      .from("trip_audit_log")
      .select("id, trip_id, entity_type, entity_id, action, summary, diff, actor_user_id, actor_email, created_at")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (entityType) query = query.eq("entity_type", entityType);
    if (entityId) query = query.eq("entity_id", entityId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    return NextResponse.json({ logs: data || [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo cargar el historial." },
      { status: 500 }
    );
  }
}

