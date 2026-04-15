import { NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";
export const maxDuration = 60;

const TABLE = "trip_shares";

export async function GET(_request: Request, context: { params: { token: string } }) {
  try {
    const token = context.params.token;
    if (!token) return NextResponse.json({ error: "Falta token" }, { status: 400 });

    const supabase = getServiceRoleClient();

    const { data: share, error: shareErr } = await supabase
      .from(TABLE)
      .select("token, trip_id, revoked_at, expires_at, created_at")
      .eq("token", token)
      .maybeSingle();

    if (shareErr) throw new Error(shareErr.message);
    if (!share) return NextResponse.json({ error: "Enlace no encontrado" }, { status: 404 });
    if (share.revoked_at) return NextResponse.json({ error: "Enlace revocado" }, { status: 410 });
    if (share.expires_at && new Date(String(share.expires_at)).getTime() < Date.now()) {
      return NextResponse.json({ error: "Enlace caducado" }, { status: 410 });
    }

    const tripId = String(share.trip_id);
    const [{ data: trip }, { data: activities }] = await Promise.all([
      supabase.from("trips").select("id, name, destination, start_date, end_date").eq("id", tripId).maybeSingle(),
      supabase
        .from("trip_activities")
        .select("id, title, activity_date, activity_time, place_name, address, activity_kind, activity_type")
        .eq("trip_id", tripId)
        .order("activity_date", { ascending: true })
        .order("activity_time", { ascending: true }),
    ]);

    return NextResponse.json(
      {
        share,
        trip: trip || null,
        activities: activities || [],
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo cargar el enlace público." },
      { status: 500 }
    );
  }
}

