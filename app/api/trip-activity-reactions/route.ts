import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";

export const runtime = "nodejs";

// Reactions use a simple JSONB column on trip_activities via a separate
// reactions table. If the table doesn't exist yet, we gracefully fall back.
// The table schema to create in Supabase:
//
//   create table trip_activity_reactions (
//     id uuid primary key default gen_random_uuid(),
//     trip_id uuid references trips(id) on delete cascade,
//     activity_id uuid references trip_activities(id) on delete cascade,
//     user_id uuid references auth.users(id) on delete cascade,
//     display_name text not null default 'Anónimo',
//     reaction text not null,  -- 'join' | 'skip' | 'maybe'
//     comment text,
//     created_at timestamptz default now(),
//     unique(activity_id, user_id)
//   );
//   create index on trip_activity_reactions(activity_id);

export type Reaction = {
  id: string;
  user_id: string;
  display_name: string;
  reaction: "join" | "skip" | "maybe";
  comment: string | null;
};

// GET /api/trip-activity-reactions?tripId=X&activityId=Y
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tripId = searchParams.get("tripId") ?? "";
    const activityId = searchParams.get("activityId") ?? "";
    if (!tripId || !activityId) return NextResponse.json({ reactions: [] });

    await requireTripAccess(tripId);
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("trip_activity_reactions")
      .select("id, user_id, display_name, reaction, comment")
      .eq("activity_id", activityId)
      .order("created_at");

    if (error) {
      // Table might not exist yet — return empty gracefully
      if (error.message?.includes("does not exist") || error.code === "42P01") {
        return NextResponse.json({ reactions: [], tableReady: false });
      }
      throw error;
    }

    return NextResponse.json({ reactions: data ?? [], tableReady: true });
  } catch (e) {
    return NextResponse.json({ reactions: [], error: e instanceof Error ? e.message : "Error" });
  }
}

// POST /api/trip-activity-reactions
// Body: { tripId, activityId, reaction: 'join'|'skip'|'maybe', comment?, displayName? }
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const tripId = String(body?.tripId || "");
    const activityId = String(body?.activityId || "");
    const reaction = String(body?.reaction || "");
    const comment = body?.comment ? String(body.comment).trim().slice(0, 500) : null;
    const displayName = body?.displayName ? String(body.displayName).trim().slice(0, 60) : "Anónimo";

    if (!tripId || !activityId || !["join", "skip", "maybe"].includes(reaction)) {
      return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
    }

    const access = await requireTripAccess(tripId);
    const supabase = await createClient();

    // Upsert — one reaction per user per activity
    const { error } = await supabase.from("trip_activity_reactions").upsert({
      trip_id: tripId,
      activity_id: activityId,
      user_id: access.userId,
      display_name: displayName,
      reaction,
      comment,
    }, { onConflict: "activity_id,user_id" });

    if (error) {
      if (error.message?.includes("does not exist") || error.code === "42P01") {
        return NextResponse.json({ ok: false, tableReady: false, error: "La tabla de reacciones no existe aún. Créala en Supabase." }, { status: 503 });
      }
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}

// DELETE /api/trip-activity-reactions?tripId=X&activityId=Y
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tripId = searchParams.get("tripId") ?? "";
    const activityId = searchParams.get("activityId") ?? "";
    if (!tripId || !activityId) return NextResponse.json({ error: "Faltan params." }, { status: 400 });

    const access = await requireTripAccess(tripId);
    const supabase = await createClient();

    await supabase.from("trip_activity_reactions")
      .delete()
      .eq("activity_id", activityId)
      .eq("user_id", access.userId);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error" }, { status: 500 });
  }
}
