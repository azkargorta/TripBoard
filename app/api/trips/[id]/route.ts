import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

async function requireCanManageTrip(tripId: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw new Error(userError.message);
  if (!user) return { ok: false as const, status: 401, error: "No autenticado." };

  const { data: participant, error: participantError } = await supabase
    .from("trip_participants")
    .select("role, can_manage_trip")
    .eq("trip_id", tripId)
    .eq("user_id", user.id)
    .neq("status", "removed")
    .maybeSingle();
  if (participantError) throw new Error(participantError.message);
  if (!participant) return { ok: false as const, status: 403, error: "Sin acceso al viaje." };

  const can = participant.role === "owner" || Boolean(participant.can_manage_trip);
  if (!can) return { ok: false as const, status: 403, error: "No tienes permisos para editar el viaje." };

  return { ok: true as const, supabase };
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: tripId } = await context.params;
    if (!tripId) return NextResponse.json({ error: "Falta id" }, { status: 400 });

    const guard = await requireCanManageTrip(tripId);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
    const supabase = guard.supabase;

    const body = await request.json().catch(() => null);
    const destination = typeof body?.destination === "string" ? body.destination.trim() : null;
    const start_date = typeof body?.start_date === "string" ? body.start_date : null;
    const end_date = typeof body?.end_date === "string" ? body.end_date : null;
    const base_currency =
      typeof body?.base_currency === "string" ? body.base_currency.trim().toUpperCase() : null;

    if (start_date && end_date && start_date > end_date) {
      return NextResponse.json(
        { error: "La fecha de inicio no puede ser posterior a la fecha de fin." },
        { status: 400 }
      );
    }

    const patch: Record<string, unknown> = {
      destination: destination || null,
      start_date: start_date || null,
      end_date: end_date || null,
      base_currency: base_currency && /^[A-Z]{3}$/.test(base_currency) ? base_currency : null,
    };

    const { data, error } = await supabase
      .from("trips")
      .update(patch)
      .eq("id", tripId)
      .select("id, name, destination, start_date, end_date, base_currency")
      .single();
    if (error) throw new Error(error.message);

    return NextResponse.json({ trip: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo actualizar el viaje." },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: tripId } = await context.params;
    if (!tripId) return NextResponse.json({ error: "Falta id" }, { status: 400 });

    const guard = await requireCanManageTrip(tripId);
    if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
    const supabase = guard.supabase;

    const { error } = await supabase.from("trips").delete().eq("id", tripId);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo eliminar el viaje." },
      { status: 500 }
    );
  }
}

