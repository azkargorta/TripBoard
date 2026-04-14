import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";
import { safeInsertAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function PATCH(request: Request, { params }: { params: { listId: string } }) {
  try {
    const body = await request.json();
    const supabase = await createClient();
    const { data: actor } = await supabase.auth.getUser();

    const { data: row, error: rowError } = await supabase
      .from("trip_lists")
      .select("*")
      .eq("id", params.listId)
      .maybeSingle();
    if (rowError) throw new Error(rowError.message);
    if (!row?.trip_id) return NextResponse.json({ error: "Lista no encontrada." }, { status: 404 });

    const access = await requireTripAccess(String(row.trip_id));
    const userId = actor?.user?.id || access.userId;
    const email = actor?.user?.email ?? null;

    // Solo owner de la lista (y por tu regla, el owner decide la editabilidad)
    if (String(row.owner_user_id) !== String(userId)) {
      return NextResponse.json({ error: "Solo el owner de la lista puede modificarla." }, { status: 403 });
    }

    const patch: Record<string, unknown> = {};
    const assign = (k: string, v: unknown) => {
      if (v !== undefined) patch[k] = v;
    };

    assign("title", typeof body?.title === "string" ? body.title.trim() : undefined);
    const visibility = body?.visibility === "private" ? "private" : body?.visibility === "shared" ? "shared" : undefined;
    if (visibility) assign("visibility", visibility);

    if (body?.editable_by_all !== undefined) {
      assign("editable_by_all", Boolean(body.editable_by_all));
    }

    // Si se vuelve privada, desactivamos editable_by_all
    if ((patch.visibility as any) === "private") {
      patch.editable_by_all = false;
    }

    if (!Object.keys(patch).length) {
      return NextResponse.json({ list: row });
    }

    const { data, error } = await supabase.from("trip_lists").update(patch).eq("id", params.listId).select("*").single();
    if (error) throw new Error(error.message);

    await safeInsertAudit(supabase, {
      trip_id: String(row.trip_id),
      entity_type: "list",
      entity_id: String(data.id),
      action: "update",
      summary: `Actualizó lista: ${String(data.title || "").trim() || "Sin título"}`,
      diff: { before: row, patch, after: data },
      actor_user_id: userId,
      actor_email: email,
    });

    return NextResponse.json({ list: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo actualizar la lista." },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, { params }: { params: { listId: string } }) {
  try {
    const supabase = await createClient();
    const { data: actor } = await supabase.auth.getUser();

    const { data: row, error: rowError } = await supabase
      .from("trip_lists")
      .select("*")
      .eq("id", params.listId)
      .maybeSingle();
    if (rowError) throw new Error(rowError.message);
    if (!row?.trip_id) return NextResponse.json({ error: "Lista no encontrada." }, { status: 404 });

    const access = await requireTripAccess(String(row.trip_id));
    const userId = actor?.user?.id || access.userId;
    const email = actor?.user?.email ?? null;

    if (String(row.owner_user_id) !== String(userId)) {
      return NextResponse.json({ error: "Solo el owner de la lista puede eliminarla." }, { status: 403 });
    }

    const { error } = await supabase.from("trip_lists").delete().eq("id", params.listId);
    if (error) throw new Error(error.message);

    await safeInsertAudit(supabase, {
      trip_id: String(row.trip_id),
      entity_type: "list",
      entity_id: String(row.id),
      action: "delete",
      summary: `Eliminó lista: ${String((row as any).title || "").trim() || "Sin título"}`,
      diff: { before: row },
      actor_user_id: userId,
      actor_email: email,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo eliminar la lista." },
      { status: 500 }
    );
  }
}

