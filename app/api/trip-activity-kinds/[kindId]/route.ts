import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";

export const runtime = "nodejs";
export const maxDuration = 60;

function normalizeKey(input: unknown) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\p{L}\p{N}_-]+/gu, "");
}

export async function PATCH(request: Request, { params }: { params: { kindId: string } }) {
  try {
    const body = await request.json().catch(() => null);
    const supabase = await createClient();

    const { data: row, error: rowError } = await supabase
      .from("trip_activity_kinds")
      .select("*")
      .eq("id", params.kindId)
      .maybeSingle();
    if (rowError) throw rowError;
    if (!row?.trip_id) return NextResponse.json({ error: "Tipo no encontrado." }, { status: 404 });

    const access = await requireTripAccess(String(row.trip_id));
    if (access.role === "viewer") return NextResponse.json({ error: "No tienes permisos." }, { status: 403 });

    const patch: Record<string, unknown> = {};
    if (body?.kind_key != null || body?.key != null) {
      const next = normalizeKey(body?.kind_key ?? body?.key);
      if (next) patch.kind_key = next;
    }
    if (body?.label != null) {
      const label = typeof body.label === "string" ? body.label.trim() : "";
      if (label) patch.label = label;
    }
    if (body?.emoji !== undefined) {
      patch.emoji = typeof body.emoji === "string" ? body.emoji.trim() || null : null;
    }
    if (body?.color !== undefined) {
      patch.color = typeof body.color === "string" ? body.color.trim() || null : null;
    }

    if (!Object.keys(patch).length) {
      return NextResponse.json({ kind: row }, { status: 200 });
    }

    const { data, error } = await supabase
      .from("trip_activity_kinds")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", params.kindId)
      .select("*")
      .single();

    if (error) throw error;
    return NextResponse.json({ kind: data }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo actualizar el tipo." },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, { params }: { params: { kindId: string } }) {
  try {
    const supabase = await createClient();

    const { data: row, error: rowError } = await supabase
      .from("trip_activity_kinds")
      .select("*")
      .eq("id", params.kindId)
      .maybeSingle();
    if (rowError) throw rowError;
    if (!row?.trip_id) return NextResponse.json({ error: "Tipo no encontrado." }, { status: 404 });

    const access = await requireTripAccess(String(row.trip_id));
    if (access.role === "viewer") return NextResponse.json({ error: "No tienes permisos." }, { status: 403 });

    const { error } = await supabase.from("trip_activity_kinds").delete().eq("id", params.kindId);
    if (error) throw error;
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo eliminar el tipo." },
      { status: 500 }
    );
  }
}

