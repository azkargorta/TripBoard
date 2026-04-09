import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const tripId = typeof body?.tripId === "string" ? body.tripId : "";
    const fromName = typeof body?.fromParticipantName === "string" ? body.fromParticipantName.trim() : "";
    const toNames: string[] = Array.isArray(body?.toParticipantNames)
      ? body.toParticipantNames.map((v: unknown) => String(v))
      : [];

    if (!tripId) return NextResponse.json({ error: "Falta tripId" }, { status: 400 });
    if (!fromName) return NextResponse.json({ error: "Falta fromParticipantName" }, { status: 400 });
    if (!toNames.length) return NextResponse.json({ error: "Falta toParticipantNames" }, { status: 400 });

    const access = await requireTripAccess(tripId);
    if (access.role === "viewer") {
      return NextResponse.json({ error: "No tienes permisos para configurar reglas." }, { status: 403 });
    }

    const supabase = await createClient();
    const now = new Date().toISOString();

    const rows = toNames
      .map((to: string) => String(to || "").trim())
      .filter((to: string) => to && to !== fromName)
      .map((to: string) => ({
        trip_id: tripId,
        from_participant_name: fromName,
        to_participant_name: to,
        allowed: true,
        prefer: false,
        updated_at: now,
      }));

    if (!rows.length) return NextResponse.json({ ok: true }, { status: 200 });

    const { error } = await supabase
      .from("trip_payment_pair_rules")
      .upsert(rows, { onConflict: "trip_id,from_participant_name,to_participant_name" });
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo restablecer." },
      { status: 500 }
    );
  }
}

