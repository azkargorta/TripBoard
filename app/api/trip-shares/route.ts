import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";

export const runtime = "nodejs";
export const maxDuration = 60;

const TABLE = "trip_shares";

async function requireCanShareTrip(tripId: string) {
  const access = await requireTripAccess(tripId);
  if (access.role === "viewer") {
    throw new Error("No tienes permisos para compartir este viaje.");
  }
  return access;
}

function makeToken() {
  // Token URL-safe, sin guiones.
  return crypto.randomUUID().replace(/-/g, "");
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const tripId = url.searchParams.get("tripId") || "";
    if (!tripId) return NextResponse.json({ error: "Falta tripId" }, { status: 400 });

    const access = await requireCanShareTrip(tripId);
    const supabase = await createClient();

    const { data, error } = await supabase
      .from(TABLE)
      .select("token, trip_id, revoked_at, created_at")
      .eq("trip_id", tripId)
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(error.message);

    return NextResponse.json({ share: data || null, tripId, userId: access.userId }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo cargar el enlace público." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const tripId = typeof body?.tripId === "string" ? body.tripId : body?.trip_id;
    if (!tripId) return NextResponse.json({ error: "Falta tripId" }, { status: 400 });

    const access = await requireCanShareTrip(tripId);
    const supabase = await createClient();

    // Si ya existe uno activo, reutilizamos (evita crear múltiples links).
    const existing = await supabase
      .from(TABLE)
      .select("token, trip_id, revoked_at, created_at")
      .eq("trip_id", tripId)
      .is("revoked_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing.error) throw new Error(existing.error.message);
    if (existing.data?.token) {
      return NextResponse.json({ share: existing.data }, { status: 200 });
    }

    const token = makeToken();

    // created_by_user_id es opcional según esquema; intentamos y hacemos fallback.
    const payload: Record<string, unknown> = {
      token,
      trip_id: tripId,
      created_by_user_id: access.userId,
      revoked_at: null,
      expires_at: null,
    };

    let { data, error } = await supabase.from(TABLE).insert(payload).select("token, trip_id, revoked_at, created_at").single();
    if (error) {
      const msg = (error.message || "").toLowerCase();
      if (msg.includes("created_by_user_id") && msg.includes("could not find")) {
        const { created_by_user_id: _omit, ...payloadWithoutCreatedBy } = payload as any;
        const retry = await supabase
          .from(TABLE)
          .insert(payloadWithoutCreatedBy)
          .select("token, trip_id, revoked_at, created_at")
          .single();
        data = retry.data;
        error = retry.error;
      }
    }
    if (error) throw new Error(error.message);

    return NextResponse.json({ share: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo crear el enlace público." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const tripId = typeof body?.tripId === "string" ? body.tripId : body?.trip_id;
    if (!tripId) return NextResponse.json({ error: "Falta tripId" }, { status: 400 });

    await requireCanShareTrip(tripId);
    const supabase = await createClient();

    const now = new Date().toISOString();
    const { error } = await supabase
      .from(TABLE)
      .update({ revoked_at: now })
      .eq("trip_id", tripId)
      .is("revoked_at", null);

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo revocar el enlace público." },
      { status: 500 }
    );
  }
}

