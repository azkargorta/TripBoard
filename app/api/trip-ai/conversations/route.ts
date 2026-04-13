import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listConversations } from "@/lib/trip-ai/chatStore";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tripId = searchParams.get("tripId") || "";
    if (!tripId) return NextResponse.json({ error: "Falta tripId" }, { status: 400 });

    // Control de acceso (sin redirects en API).
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) return NextResponse.json({ error: userError.message }, { status: 401 });
    if (!user) return NextResponse.json({ error: "No hay sesión activa." }, { status: 401 });

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("is_premium")
      .eq("id", user.id)
      .maybeSingle();
    if (!Boolean((profileRow as any)?.is_premium)) {
      return NextResponse.json(
        { error: "Necesitas Premium para usar la IA.", code: "PREMIUM_REQUIRED" },
        { status: 402 }
      );
    }

    const { data: participant, error: participantError } = await supabase
      .from("trip_participants")
      .select("id")
      .eq("trip_id", tripId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (participantError) throw participantError;
    if (!participant) return NextResponse.json({ error: "No tienes acceso a este viaje." }, { status: 403 });

    const conversations = await listConversations(tripId);
    return NextResponse.json({ conversations });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudieron cargar las conversaciones." },
      { status: 500 }
    );
  }
}

