import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tripId = searchParams.get("tripId") || "";
    if (!tripId) return NextResponse.json({ error: "Falta tripId" }, { status: 400 });

    await requireTripAccess(tripId);
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("trip_place_folders")
      .select("*")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ folders: data || [] });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudieron cargar las carpetas." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const tripId = typeof body?.tripId === "string" ? body.tripId : body?.trip_id;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const color = typeof body?.color === "string" ? body.color.trim() : null;
    if (!tripId) return NextResponse.json({ error: "Falta tripId" }, { status: 400 });
    if (!name) return NextResponse.json({ error: "Falta nombre de carpeta." }, { status: 400 });

    const access = await requireTripAccess(String(tripId));
    if (!access.can_manage_map) return NextResponse.json({ error: "No tienes permisos." }, { status: 403 });

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("trip_place_folders")
      .insert({
        trip_id: tripId,
        name,
        color,
        created_by_user_id: access.userId,
      })
      .select("*")
      .single();
    if (error) throw error;
    return NextResponse.json({ folder: data }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo crear la carpeta." },
      { status: 500 }
    );
  }
}

