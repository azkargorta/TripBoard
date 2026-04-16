import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function DELETE(
  _request: Request,
  { params }: { params: { routeId: string } }
) {
  try {
    const supabase = await createClient();

    const { data: routeRow, error: routeError } = await supabase
      .from("routes")
      .select("*")
      .eq("id", params.routeId)
      .maybeSingle();

    if (routeError) throw new Error(routeError.message);
    if (!routeRow?.trip_id) {
      return NextResponse.json({ error: "Ruta legacy no encontrada." }, { status: 404 });
    }

    const access = await requireTripAccess(String(routeRow.trip_id));
    if (!access.can_manage_map) {
      return NextResponse.json({ error: "No tienes permisos para borrar esta ruta." }, { status: 403 });
    }

    const { error } = await supabase.from("routes").delete().eq("id", params.routeId);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo eliminar la ruta legacy." },
      { status: 500 }
    );
  }
}

