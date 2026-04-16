import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tripId = searchParams.get("tripId") || "";
    const folderId = searchParams.get("folderId");
    if (!tripId) return NextResponse.json({ error: "Falta tripId" }, { status: 400 });

    await requireTripAccess(tripId);
    const supabase = await createClient();

    let q = supabase.from("trip_places").select("*").eq("trip_id", tripId).order("created_at", { ascending: false });
    if (folderId) q = q.eq("folder_id", folderId);
    const { data, error } = await q;
    if (error) throw error;
    return NextResponse.json({ places: data || [] });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudieron cargar los lugares." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const tripId = typeof body?.tripId === "string" ? body.tripId : body?.trip_id;
    const folderId = typeof body?.folderId === "string" ? body.folderId : body?.folder_id;
    const place_id = typeof body?.place_id === "string" ? body.place_id : null;
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const address = typeof body?.address === "string" ? body.address.trim() : null;
    const latitude = typeof body?.latitude === "number" ? body.latitude : null;
    const longitude = typeof body?.longitude === "number" ? body.longitude : null;
    const category = typeof body?.category === "string" ? body.category.trim().toLowerCase() : null;
    const notes = typeof body?.notes === "string" ? body.notes.trim() : null;

    if (!tripId) return NextResponse.json({ error: "Falta tripId" }, { status: 400 });
    if (!name) return NextResponse.json({ error: "Falta nombre del lugar." }, { status: 400 });

    const access = await requireTripAccess(String(tripId));
    if (!access.can_manage_map) return NextResponse.json({ error: "No tienes permisos." }, { status: 403 });

    const supabase = await createClient();

    const { data, error } = await supabase
      .from("trip_places")
      .insert({
        trip_id: tripId,
        folder_id: folderId ?? null,
        place_id,
        name,
        address,
        latitude,
        longitude,
        category,
        notes,
        created_by_user_id: access.userId,
      })
      .select("*")
      .single();
    if (error) throw error;
    return NextResponse.json({ place: data }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo guardar el lugar." },
      { status: 500 }
    );
  }
}

