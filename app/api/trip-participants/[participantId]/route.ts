import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";
import { normalizePermissions, type TripRole } from "@/lib/participants";

export const runtime = "nodejs";
export const maxDuration = 60;

async function getTripIdForParticipant(
  supabase: Awaited<ReturnType<typeof createClient>>,
  participantId: string
) {
  const { data, error } = await supabase
    .from("trip_participants")
    .select("trip_id")
    .eq("id", participantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.trip_id as string | undefined;
}

export async function PATCH(request: Request, { params }: { params: { participantId: string } }) {
  try {
    const body = await request.json().catch(() => null);
    const supabase = await createClient();

    const tripId = await getTripIdForParticipant(supabase, params.participantId);
    if (!tripId) return NextResponse.json({ error: "Participante no encontrado." }, { status: 404 });

    const access = await requireTripAccess(tripId);
    if (access.role !== "owner") {
      return NextResponse.json({ error: "Solo el owner puede gestionar participantes." }, { status: 403 });
    }

    const { data: current, error: currentError } = await supabase
      .from("trip_participants")
      .select("*")
      .eq("id", params.participantId)
      .maybeSingle();
    if (currentError) throw new Error(currentError.message);
    if (!current) return NextResponse.json({ error: "Participante no encontrado." }, { status: 404 });

    const nextRole = (typeof body?.role === "string" ? body.role : current.role) as TripRole;
    const permissions = normalizePermissions(nextRole, {
      can_manage_trip: body?.can_manage_trip ?? current.can_manage_trip,
      can_manage_participants: body?.can_manage_participants ?? current.can_manage_participants,
      can_manage_expenses: body?.can_manage_expenses ?? current.can_manage_expenses,
      can_manage_plan: body?.can_manage_plan ?? current.can_manage_plan,
      can_manage_map: body?.can_manage_map ?? current.can_manage_map,
      can_manage_resources: body?.can_manage_resources ?? current.can_manage_resources,
    });

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      role: nextRole,
      status: typeof body?.status === "string" ? body.status : current.status,
      can_manage_trip: permissions.can_manage_trip,
      can_manage_participants: permissions.can_manage_participants,
      can_manage_expenses: permissions.can_manage_expenses,
      can_manage_plan: permissions.can_manage_plan,
      can_manage_map: permissions.can_manage_map,
      can_manage_resources: permissions.can_manage_resources,
    };

    if (body?.display_name !== undefined) patch.display_name = String(body.display_name || "").trim();
    if (body?.username !== undefined) patch.username = body.username ? String(body.username).trim() : null;
    if (body?.email !== undefined) patch.email = body.email ? String(body.email).trim().toLowerCase() : null;
    if (body?.phone !== undefined) patch.phone = body.phone ? String(body.phone).trim() : null;
    if (body?.joined_via !== undefined) patch.joined_via = body.joined_via ? String(body.joined_via) : null;
    if (body?.user_id !== undefined) patch.user_id = body.user_id ? String(body.user_id) : null;
    if (body?.linked_at !== undefined) patch.linked_at = body.linked_at ?? null;

    const { data, error } = await supabase
      .from("trip_participants")
      .update(patch)
      .eq("id", params.participantId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    return NextResponse.json({ participant: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo actualizar el participante." },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, { params }: { params: { participantId: string } }) {
  try {
    const supabase = await createClient();
    const tripId = await getTripIdForParticipant(supabase, params.participantId);
    if (!tripId) return NextResponse.json({ error: "Participante no encontrado." }, { status: 404 });

    const access = await requireTripAccess(tripId);
    if (access.role !== "owner") {
      return NextResponse.json({ error: "Solo el owner puede gestionar participantes." }, { status: 403 });
    }

    // Evitar eliminar el último owner activo.
    const { data: owners, error: ownersError } = await supabase
      .from("trip_participants")
      .select("id, role, status")
      .eq("trip_id", tripId)
      .eq("role", "owner")
      .eq("status", "active");
    if (ownersError) throw new Error(ownersError.message);

    const { data: current, error: currentError } = await supabase
      .from("trip_participants")
      .select("id, role, status")
      .eq("id", params.participantId)
      .maybeSingle();
    if (currentError) throw new Error(currentError.message);
    if (!current) return NextResponse.json({ error: "Participante no encontrado." }, { status: 404 });

    if (current.role === "owner" && current.status === "active" && (owners?.length ?? 0) <= 1) {
      return NextResponse.json({ error: "El viaje debe mantener al menos un owner activo." }, { status: 400 });
    }

    const { error } = await supabase
      .from("trip_participants")
      .update({ status: "removed", updated_at: new Date().toISOString() })
      .eq("id", params.participantId);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo eliminar el participante." },
      { status: 500 }
    );
  }
}

