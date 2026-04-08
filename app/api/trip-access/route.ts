import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tripId = searchParams.get("tripId");
    if (!tripId) return NextResponse.json({ error: "Falta tripId" }, { status: 400 });

    const access = await requireTripAccess(tripId);
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("trip_participants")
      .select("role, can_manage_participants")
      .eq("id", access.participantId)
      .maybeSingle();
    if (error) throw new Error(error.message);

    const canManageParticipants = access.role === "owner" || Boolean(data?.can_manage_participants);

    return NextResponse.json({
      access: {
        role: access.role,
        canManageParticipants,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo comprobar el acceso." },
      { status: 500 }
    );
  }
}

