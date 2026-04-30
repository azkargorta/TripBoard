import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";
import { safeInsertAudit } from "@/lib/audit";

export const runtime = "nodejs";
export const maxDuration = 60;

function cleanString(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

type BulkActivityInput = {
  title: string;
  description?: string | null;
  activity_date?: string | null;
  activity_time?: string | null;
  place_name?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  activity_type?: string | null;
  activity_kind?: string | null;
  source?: string | null;
};

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const tripId = typeof body?.tripId === "string" ? body.tripId : body?.trip_id;
    const activities = Array.isArray(body?.activities) ? (body.activities as BulkActivityInput[]) : [];

    if (!tripId) return NextResponse.json({ error: "Falta tripId" }, { status: 400 });
    if (!activities.length) return NextResponse.json({ error: "Faltan activities" }, { status: 400 });

    const access = await requireTripAccess(String(tripId));
    if (!access.can_manage_plan) return NextResponse.json({ error: "No tienes permisos." }, { status: 403 });

    const supabase = await createClient();
    const { data: actor } = await supabase.auth.getUser();

    const rows = activities
      .map((a) => {
        const title = cleanString((a as any)?.title);
        if (!title) return null;
        return {
          trip_id: tripId,
          title,
          description: cleanString((a as any)?.description),
          activity_date: cleanString((a as any)?.activity_date),
          activity_time: cleanString((a as any)?.activity_time),
          place_name: cleanString((a as any)?.place_name),
          address: cleanString((a as any)?.address),
          latitude: numOrNull((a as any)?.latitude),
          longitude: numOrNull((a as any)?.longitude),
          activity_type: cleanString((a as any)?.activity_type) ?? "general",
          activity_kind: cleanString((a as any)?.activity_kind) ?? "visit",
          source: cleanString((a as any)?.source) ?? "ai_planner",
          created_by_user_id: access.userId,
        };
      })
      .filter(Boolean) as any[];

    if (!rows.length) return NextResponse.json({ error: "No hay filas válidas para insertar." }, { status: 400 });

    const { data, error } = await supabase.from("trip_activities").insert(rows).select("id, title");
    if (error) throw new Error(error.message || "No se pudieron crear actividades.");

    await safeInsertAudit(supabase, {
      trip_id: String(tripId),
      entity_type: "activity",
      entity_id: "bulk",
      action: "create",
      summary: `Creó ${rows.length} planes automáticamente`,
      diff: { count: rows.length },
      actor_user_id: actor?.user?.id ?? null,
      actor_email: actor?.user?.email ?? null,
    });

    return NextResponse.json({ ok: true, created: (data || []).length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudieron crear actividades." }, { status: 500 });
  }
}

