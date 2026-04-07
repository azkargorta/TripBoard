import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";
import { normalizePermissions, type TripRole } from "@/lib/participants";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tripId = searchParams.get("tripId");
    if (!tripId) return NextResponse.json({ error: "Falta tripId" }, { status: 400 });

    await requireTripAccess(tripId);
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("trip_participants")
      .select("*")
      .eq("trip_id", tripId)
      .neq("status", "removed")
      .order("created_at", { ascending: true });

    if (error) throw new Error(error.message);

    return NextResponse.json({ participants: data || [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudieron cargar los participantes." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const tripId = typeof body?.tripId === "string" ? body.tripId : body?.trip_id;
    if (!tripId) return NextResponse.json({ error: "Falta tripId" }, { status: 400 });

    const access = await requireTripAccess(tripId);
    if (access.role !== "owner") {
      return NextResponse.json({ error: "Solo el owner puede gestionar participantes." }, { status: 403 });
    }

    const supabase = await createClient();

    const role = (typeof body?.role === "string" ? body.role : "viewer") as TripRole;
    const permissions = normalizePermissions(role, body || undefined);

    const payload = {
      trip_id: tripId,
      display_name: typeof body?.display_name === "string" ? body.display_name.trim() : "",
      username: typeof body?.username === "string" ? body.username.trim() : null,
      email: typeof body?.email === "string" ? body.email.trim().toLowerCase() : null,
      phone: typeof body?.phone === "string" ? body.phone.trim() : null,
      joined_via: typeof body?.joined_via === "string" ? body.joined_via : "manual",
      user_id: typeof body?.user_id === "string" ? body.user_id : null,
      role,
      status: typeof body?.status === "string" ? body.status : (body?.user_id ? "active" : "pending"),
      linked_at: typeof body?.linked_at === "string" ? body.linked_at : (body?.user_id ? new Date().toISOString() : null),
      ...permissions,
    };

    if (!payload.display_name.trim()) {
      return NextResponse.json({ error: "Falta display_name" }, { status: 400 });
    }

    const { data, error } = await supabase.from("trip_participants").insert(payload).select("*").single();
    if (error) throw new Error(error.message);

    return NextResponse.json({ participant: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo crear el participante." },
      { status: 500 }
    );
  }
}

