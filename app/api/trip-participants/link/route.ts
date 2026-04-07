import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const participantId = typeof body?.participantId === "string" ? body.participantId : null;
    const profile = body?.profile as { id?: string; username?: string; email?: string } | null;

    if (!participantId) return NextResponse.json({ error: "Falta participantId" }, { status: 400 });
    if (!profile?.id) return NextResponse.json({ error: "Falta profile.id" }, { status: 400 });

    const supabase = await createClient();
    const { data: participant, error: participantError } = await supabase
      .from("trip_participants")
      .select("*")
      .eq("id", participantId)
      .maybeSingle();
    if (participantError) throw new Error(participantError.message);
    if (!participant?.trip_id) return NextResponse.json({ error: "Participante no encontrado." }, { status: 404 });

    const access = await requireTripAccess(participant.trip_id);
    if (access.role !== "owner") {
      return NextResponse.json({ error: "Solo el owner puede gestionar participantes." }, { status: 403 });
    }

    const { data: duplicate, error: duplicateError } = await supabase
      .from("trip_participants")
      .select("id")
      .eq("trip_id", participant.trip_id)
      .neq("id", participantId)
      .eq("user_id", profile.id)
      .neq("status", "removed")
      .maybeSingle();
    if (duplicateError) throw new Error(duplicateError.message);
    if (duplicate) {
      return NextResponse.json(
        { error: "Ese usuario ya está vinculado a otro participante del viaje." },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("trip_participants")
      .update({
        user_id: profile.id,
        username: typeof profile.username === "string" ? profile.username : participant.username,
        email: typeof profile.email === "string" ? profile.email : participant.email,
        joined_via: participant.joined_via === "manual" ? "linked" : participant.joined_via,
        linked_at: new Date().toISOString(),
        status: "active",
        updated_at: new Date().toISOString(),
      })
      .eq("id", participantId);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo vincular el perfil." },
      { status: 500 }
    );
  }
}

