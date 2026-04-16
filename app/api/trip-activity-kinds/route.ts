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

function sentenceCase(input: unknown) {
  const raw = typeof input === "string" ? input.trim() : "";
  if (!raw) return "";
  const lower = raw.toLowerCase();
  return lower.slice(0, 1).toUpperCase() + lower.slice(1);
}

function normalizeEmoji(input: unknown) {
  const s = typeof input === "string" ? input.trim() : "";
  return s || null;
}

function normalizeColor(input: unknown) {
  const s = typeof input === "string" ? input.trim() : "";
  if (!s) return null;
  return s;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tripId = searchParams.get("tripId") || "";
    if (!tripId) return NextResponse.json({ error: "Falta tripId" }, { status: 400 });

    await requireTripAccess(tripId);
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("trip_activity_kinds")
      .select("*")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: true });

    if (error) {
      // Si la tabla aún no existe en Supabase, devolvemos respuesta usable para UI.
      const msg = (error.message || "").toLowerCase();
      if (msg.includes("relation") && msg.includes("does not exist")) {
        return NextResponse.json(
          {
            kinds: [],
            warning:
              "La tabla `trip_activity_kinds` no existe todavía. Ejecuta `docs/tripboard_plan_custom_kinds.sql` en Supabase para activar tipos personalizados.",
          },
          { status: 200 }
        );
      }
      throw error;
    }

    return NextResponse.json({ kinds: data || [] });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudieron cargar los tipos." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const tripId = typeof body?.tripId === "string" ? body.tripId : body?.trip_id;
    const kindKey = normalizeKey(body?.kind_key ?? body?.key ?? body?.kindKey ?? body?.name);
    const label = sentenceCase(typeof body?.label === "string" ? body.label : body?.name);
    const emoji = normalizeEmoji(body?.emoji);
    const color = normalizeColor(body?.color);

    if (!tripId) return NextResponse.json({ error: "Falta tripId" }, { status: 400 });
    if (!kindKey) return NextResponse.json({ error: "Falta kind_key" }, { status: 400 });
    if (!label) return NextResponse.json({ error: "Falta label" }, { status: 400 });

    const access = await requireTripAccess(String(tripId));
    if (access.role === "viewer") return NextResponse.json({ error: "No tienes permisos." }, { status: 403 });

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("trip_activity_kinds")
      .insert({
        trip_id: tripId,
        kind_key: kindKey,
        label,
        emoji,
        color,
        created_by_user_id: access.userId,
      })
      .select("*")
      .single();

    if (error) throw error;
    return NextResponse.json({ kind: data }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo crear el tipo." },
      { status: 500 }
    );
  }
}

