import { NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: { token: string } }) {
  try {
    const token = context.params.token;
    if (!token) {
      return NextResponse.json({ error: "Falta token" }, { status: 400 });
    }

    const supabase = getServiceRoleClient();
    const { data, error } = await supabase.from("trip_invites").select("*").eq("token", token).maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: "Invitación no encontrada" }, { status: 404 });
    }

    return NextResponse.json({ invite: data });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo cargar la invitación." },
      { status: 500 }
    );
  }
}
