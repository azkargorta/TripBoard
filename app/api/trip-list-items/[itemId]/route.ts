import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";
import { safeInsertAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const maxDuration = 60;

function toNumberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function PATCH(request: Request, { params }: { params: { itemId: string } }) {
  try {
    const body = await request.json();
    const supabase = await createClient();
    const { data: actor } = await supabase.auth.getUser();

    const { data: row, error: rowError } = await supabase
      .from("trip_list_items")
      .select("*")
      .eq("id", params.itemId)
      .maybeSingle();
    if (rowError) throw new Error(rowError.message);
    if (!row?.trip_id) return NextResponse.json({ error: "Item no encontrado." }, { status: 404 });

    const access = await requireTripAccess(String(row.trip_id));
    const userId = actor?.user?.id || access.userId;
    const email = actor?.user?.email ?? null;

    const patch: Record<string, unknown> = {};
    const assign = (k: string, v: unknown) => {
      if (v !== undefined) patch[k] = v;
    };

    assign("text", typeof body?.text === "string" ? body.text.trim() : undefined);
    if (body?.qty !== undefined) assign("qty", toNumberOrNull(body.qty));
    if (body?.note !== undefined) assign("note", body.note === null ? null : typeof body.note === "string" ? body.note : undefined);
    if (body?.is_done !== undefined) assign("is_done", Boolean(body.is_done));
    if (body?.position !== undefined) {
      const p = typeof body.position === "number" ? body.position : Number(body.position);
      if (Number.isFinite(p)) assign("position", Math.max(0, Math.floor(p)));
    }

    if (!Object.keys(patch).length) return NextResponse.json({ item: row });

    const { data, error } = await supabase
      .from("trip_list_items")
      .update(patch)
      .eq("id", params.itemId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await safeInsertAudit(supabase, {
      trip_id: String(row.trip_id),
      entity_type: "list_item",
      entity_id: String(data.id),
      action: "update",
      summary: `Actualizó item: ${String(data.text || "").trim() || "Sin texto"}`,
      diff: { before: row, patch, after: data },
      actor_user_id: userId,
      actor_email: email,
    });

    return NextResponse.json({ item: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo actualizar el item." },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, { params }: { params: { itemId: string } }) {
  try {
    const supabase = await createClient();
    const { data: actor } = await supabase.auth.getUser();

    const { data: row, error: rowError } = await supabase
      .from("trip_list_items")
      .select("*")
      .eq("id", params.itemId)
      .maybeSingle();
    if (rowError) throw new Error(rowError.message);
    if (!row?.trip_id) return NextResponse.json({ error: "Item no encontrado." }, { status: 404 });

    const access = await requireTripAccess(String(row.trip_id));
    const userId = actor?.user?.id || access.userId;
    const email = actor?.user?.email ?? null;

    const { error } = await supabase.from("trip_list_items").delete().eq("id", params.itemId);
    if (error) throw new Error(error.message);

    await safeInsertAudit(supabase, {
      trip_id: String(row.trip_id),
      entity_type: "list_item",
      entity_id: String(row.id),
      action: "delete",
      summary: `Eliminó item: ${String((row as any).text || "").trim() || "Sin texto"}`,
      diff: { before: row },
      actor_user_id: userId,
      actor_email: email,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo eliminar el item." },
      { status: 500 }
    );
  }
}

