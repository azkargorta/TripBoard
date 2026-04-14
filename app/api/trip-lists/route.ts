import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";
import { safeInsertAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const maxDuration = 60;

async function getParticipant(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tripId: string,
  userId: string
) {
  const { data, error } = await supabase
    .from("trip_participants")
    .select("id, role, can_manage_resources, status")
    .eq("trip_id", tripId)
    .eq("user_id", userId)
    .neq("status", "removed")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as any;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tripId = searchParams.get("tripId");
    if (!tripId) return NextResponse.json({ error: "Falta tripId" }, { status: 400 });

    const access = await requireTripAccess(tripId);
    const supabase = await createClient();

    const { data: actor } = await supabase.auth.getUser();
    const userId = actor?.user?.id || access.userId;

    // listas visibles: shared + privadas propias
    const { data: lists, error } = await supabase
      .from("trip_lists")
      .select("id, trip_id, title, visibility, editable_by_all, owner_user_id, created_at, updated_at")
      .eq("trip_id", tripId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);

    // contadores por lista
    const listIds = (lists || []).map((l: any) => l.id);
    let countsByList: Record<string, { total: number; done: number }> = {};
    if (listIds.length) {
      const { data: items, error: itemsError } = await supabase
        .from("trip_list_items")
        .select("list_id, is_done")
        .in("list_id", listIds)
        .eq("trip_id", tripId);
      if (itemsError) throw new Error(itemsError.message);
      countsByList = (items || []).reduce((acc: any, row: any) => {
        const id = String(row.list_id);
        if (!acc[id]) acc[id] = { total: 0, done: 0 };
        acc[id].total += 1;
        if (row.is_done) acc[id].done += 1;
        return acc;
      }, {});
    }

    const participant = await getParticipant(supabase, tripId, userId);
    const role = (participant?.role ?? access.role ?? "viewer") as "owner" | "editor" | "viewer";
    const canManageResources = role === "owner" || role === "editor" || Boolean(participant?.can_manage_resources);

    return NextResponse.json({
      lists: lists || [],
      countsByList,
      access: { role, canManageResources },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudieron cargar las listas." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const tripId = typeof body?.tripId === "string" ? body.tripId : body?.trip_id;
    if (!tripId) return NextResponse.json({ error: "Falta tripId" }, { status: 400 });

    const access = await requireTripAccess(tripId);
    const supabase = await createClient();
    const { data: actor } = await supabase.auth.getUser();

    const userId = actor?.user?.id || access.userId;
    const email = actor?.user?.email ?? null;

    // cualquier participante puede crear listas (la editabilidad se controla por lista)
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    const visibility = body?.visibility === "private" ? "private" : "shared";
    const editableByAll = Boolean(body?.editable_by_all);

    if (!title) return NextResponse.json({ error: "Falta title" }, { status: 400 });

    const payload = {
      trip_id: tripId,
      title,
      visibility,
      editable_by_all: visibility === "shared" ? editableByAll : false,
      owner_user_id: userId,
    };

    const { data, error } = await supabase.from("trip_lists").insert(payload).select("*").single();
    if (error) throw new Error(error.message);

    await safeInsertAudit(supabase, {
      trip_id: tripId,
      entity_type: "list",
      entity_id: String(data.id),
      action: "create",
      summary: `Creó lista: ${String(data.title || "").trim() || "Sin título"}`,
      diff: { after: data },
      actor_user_id: userId,
      actor_email: email,
    });

    return NextResponse.json({ list: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo crear la lista." },
      { status: 500 }
    );
  }
}

