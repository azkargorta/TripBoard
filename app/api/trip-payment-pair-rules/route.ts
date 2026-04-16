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

    await requireTripAccess(tripId);
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("trip_payment_pair_rules")
      .select("id, trip_id, from_participant_name, to_participant_name, allowed, prefer, updated_at")
      .eq("trip_id", tripId)
      .order("from_participant_name", { ascending: true })
      .order("to_participant_name", { ascending: true });
    if (error) throw new Error(error.message);

    return NextResponse.json({ rules: data || [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudieron cargar las reglas." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const tripId = typeof body?.tripId === "string" ? body.tripId : body?.trip_id;
    const fromName =
      typeof body?.fromParticipantName === "string"
        ? body.fromParticipantName.trim()
        : typeof body?.from_participant_name === "string"
          ? body.from_participant_name.trim()
          : "";
    const toName =
      typeof body?.toParticipantName === "string"
        ? body.toParticipantName.trim()
        : typeof body?.to_participant_name === "string"
          ? body.to_participant_name.trim()
          : "";
    if (!tripId) return NextResponse.json({ error: "Falta tripId" }, { status: 400 });
    if (!fromName || !toName) return NextResponse.json({ error: "Falta from/to" }, { status: 400 });
    if (fromName === toName) return NextResponse.json({ error: "from y to no pueden ser iguales." }, { status: 400 });

    const access = await requireTripAccess(tripId);
    if (!access.can_manage_expenses) {
      return NextResponse.json({ error: "No tienes permisos para configurar reglas." }, { status: 403 });
    }

    const allowed = typeof body?.allowed === "boolean" ? body.allowed : true;
    const prefer = typeof body?.prefer === "boolean" ? body.prefer : false;

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("trip_payment_pair_rules")
      .upsert(
        {
          trip_id: tripId,
          from_participant_name: fromName,
          to_participant_name: toName,
          allowed,
          prefer,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "trip_id,from_participant_name,to_participant_name" }
      )
      .select("id, trip_id, from_participant_name, to_participant_name, allowed, prefer, updated_at")
      .single();
    if (error) throw new Error(error.message);

    return NextResponse.json({ rule: data }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo guardar la regla." },
      { status: 500 }
    );
  }
}

