import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizePermissions, normalizeRole } from "@/lib/permissions";

export const runtime = "nodejs";
export const maxDuration = 60;

const DESC_MAX = 10_000;

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
    .select(
      "role, can_manage_trip, can_manage_plan, can_manage_participants, can_manage_expenses, can_manage_map, can_manage_resources"
    )
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

async function requireCanEditTripNotes(tripId: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) throw new Error(userError.message);
  if (!user) return { ok: false as const, status: 401, error: "No autenticado." };

  const { data: participant, error: participantError } = await supabase
    .from("trip_participants")
    .select(
      "role, can_manage_trip, can_manage_plan, can_manage_participants, can_manage_expenses, can_manage_map, can_manage_resources"
    )
    .eq("trip_id", tripId)
    .eq("user_id", user.id)
    .neq("status", "removed")
    .maybeSingle();
  if (participantError) throw new Error(participantError.message);
  if (!participant) return { ok: false as const, status: 403, error: "Sin acceso al viaje." };

  const role = normalizeRole((participant as { role?: string | null }).role);
  const perms = normalizePermissions(role, participant as Record<string, unknown>);
  const canTrip = role === "owner" || Boolean((participant as { can_manage_trip?: boolean }).can_manage_trip);
  const canPlan = Boolean(perms.can_manage_plan);
  if (!canTrip && !canPlan) {
    return { ok: false as const, status: 403, error: "No tienes permisos para editar las notas del viaje." };
  }

  return { ok: true as const, supabase };
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: tripId } = await context.params;
    if (!tripId) return NextResponse.json({ error: "Falta id" }, { status: 400 });

    const body = await request.json().catch(() => null);
    const wantsMeta =
      body &&
      ("destination" in body || "start_date" in body || "end_date" in body || "base_currency" in body);
    const wantsDescription = body && "description" in body;

    if (!wantsMeta && !wantsDescription) {
      return NextResponse.json({ error: "Nada que actualizar." }, { status: 400 });
    }

    let supabase: Awaited<ReturnType<typeof createClient>>;

    if (wantsMeta) {
      const guard = await requireCanManageTrip(tripId);
      if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
      supabase = guard.supabase;
    } else {
      const guard = await requireCanEditTripNotes(tripId);
      if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
      supabase = guard.supabase;
    }

    const patch: Record<string, unknown> = {};

    if (wantsMeta) {
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

      patch.destination = destination || null;
      patch.start_date = start_date || null;
      patch.end_date = end_date || null;
      patch.base_currency = base_currency && /^[A-Z]{3}$/.test(base_currency) ? base_currency : null;
    }

    if (wantsDescription) {
      const raw = (body as { description?: unknown }).description;
      if (raw !== null && typeof raw !== "string") {
        return NextResponse.json({ error: "El campo description debe ser texto o null." }, { status: 400 });
      }
      const trimmed = typeof raw === "string" ? raw.trim().slice(0, DESC_MAX) : "";
      patch.description = trimmed.length ? trimmed : null;
    }

    const { data, error } = await supabase
      .from("trips")
      .update(patch)
      .eq("id", tripId)
      .select("id, name, destination, start_date, end_date, base_currency, description")
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

