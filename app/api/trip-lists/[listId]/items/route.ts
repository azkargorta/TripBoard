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

export async function GET(request: Request, { params }: { params: { listId: string } }) {
  try {
    const { searchParams } = new URL(request.url);
    const tripId = searchParams.get("tripId");
    if (!tripId) return NextResponse.json({ error: "Falta tripId" }, { status: 400 });

    await requireTripAccess(tripId);
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("trip_list_items")
      .select("*")
      .eq("trip_id", tripId)
      .eq("list_id", params.listId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);

    return NextResponse.json({ items: data || [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudieron cargar los items." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, { params }: { params: { listId: string } }) {
  try {
    const body = await request.json();
    const tripId = typeof body?.tripId === "string" ? body.tripId : body?.trip_id;
    if (!tripId) return NextResponse.json({ error: "Falta tripId" }, { status: 400 });

    const access = await requireTripAccess(tripId);
    const supabase = await createClient();
    const { data: actor } = await supabase.auth.getUser();
    const userId = actor?.user?.id || access.userId;
    const email = actor?.user?.email ?? null;

    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text) return NextResponse.json({ error: "Falta text" }, { status: 400 });

    const qty = toNumberOrNull(body?.qty);
    const note = typeof body?.note === "string" ? body.note : body?.note === null ? null : null;

    // posición: por defecto al final
    const { data: last, error: lastError } = await supabase
      .from("trip_list_items")
      .select("position")
      .eq("trip_id", tripId)
      .eq("list_id", params.listId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastError) throw new Error(lastError.message);
    const position = Number.isFinite(Number((last as any)?.position)) ? Number((last as any).position) + 1 : 0;

    const payload = {
      trip_id: tripId,
      list_id: params.listId,
      text,
      qty,
      note,
      is_done: Boolean(body?.is_done),
      position,
      created_by_user_id: userId,
    };

    const { data, error } = await supabase.from("trip_list_items").insert(payload).select("*").single();
    if (error) throw new Error(error.message);

    await safeInsertAudit(supabase, {
      trip_id: tripId,
      entity_type: "list_item",
      entity_id: String(data.id),
      action: "create",
      summary: `Añadió item: ${String(data.text || "").trim() || "Sin texto"}`,
      diff: { after: data },
      actor_user_id: userId,
      actor_email: email,
    });

    return NextResponse.json({ item: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo crear el item." },
      { status: 500 }
    );
  }
}

