import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";
import { normalizePermissions, type TripRole } from "@/lib/participants";

export const runtime = "nodejs";
export const maxDuration = 60;

async function requireCanManageParticipants(tripId: string) {
  const access = await requireTripAccess(tripId);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trip_participants")
    .select("role, can_manage_participants")
    .eq("trip_id", tripId)
    .eq("user_id", access.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const can = data?.role === "owner" || Boolean(data?.can_manage_participants);
  if (!can) throw new Error("No tienes permisos para gestionar participantes.");
  return access;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const tripId = typeof body?.tripId === "string" ? body.tripId : body?.trip_id;
    if (!tripId) return NextResponse.json({ error: "Falta tripId" }, { status: 400 });

    const access = await requireCanManageParticipants(tripId);
    const supabase = await createClient();

    const role = (typeof body?.role === "string" ? body.role : "viewer") as TripRole;
    const permissions = normalizePermissions(role, body || undefined);
    const token = crypto.randomUUID().replace(/-/g, "");

    const payload = {
      trip_id: tripId,
      participant_id: typeof body?.participant_id === "string" ? body.participant_id : null,
      token,
      display_name: typeof body?.display_name === "string" ? body.display_name.trim() : null,
      email: typeof body?.email === "string" ? body.email.trim().toLowerCase() : null,
      role,
      status: "pending",
      created_by_user_id: access.userId,
      expires_at: null,
      ...permissions,
    };

    const { data, error } = await supabase.from("trip_invites").insert(payload).select("*").single();
    if (error) throw new Error(error.message);

    return NextResponse.json({ invite: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo crear la invitación." },
      { status: 500 }
    );
  }
}

