import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";

export const runtime = "nodejs";
export const maxDuration = 60;

function normalizeMethods(value: unknown): string[] {
  const allowed = new Set(["bizum", "transfer", "cash"]);
  if (!Array.isArray(value)) return ["bizum", "transfer", "cash"];
  const methods = value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim().toLowerCase())
    .filter((v) => allowed.has(v));
  return methods.length ? methods : ["bizum", "transfer", "cash"];
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tripId = searchParams.get("tripId");
    if (!tripId) return NextResponse.json({ error: "Falta tripId" }, { status: 400 });

    await requireTripAccess(tripId);
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("trip_payment_preferences")
      .select("id, trip_id, participant_name, send_methods, receive_methods, updated_at")
      .eq("trip_id", tripId)
      .order("participant_name", { ascending: true });
    if (error) throw new Error(error.message);

    return NextResponse.json({ preferences: data || [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudieron cargar las preferencias." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const tripId = typeof body?.tripId === "string" ? body.tripId : body?.trip_id;
    const participantName = typeof body?.participantName === "string" ? body.participantName.trim() : body?.participant_name?.trim?.();
    if (!tripId) return NextResponse.json({ error: "Falta tripId" }, { status: 400 });
    if (!participantName) return NextResponse.json({ error: "Falta participantName" }, { status: 400 });

    const access = await requireTripAccess(tripId);
    if (access.role === "viewer") {
      return NextResponse.json({ error: "No tienes permisos para configurar pagos." }, { status: 403 });
    }

    const sendMethods = normalizeMethods(body?.send_methods ?? body?.sendMethods);
    const receiveMethods = normalizeMethods(body?.receive_methods ?? body?.receiveMethods);

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("trip_payment_preferences")
      .upsert(
        {
          trip_id: tripId,
          participant_name: participantName,
          send_methods: sendMethods,
          receive_methods: receiveMethods,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "trip_id,participant_name" }
      )
      .select("id, trip_id, participant_name, send_methods, receive_methods, updated_at")
      .single();
    if (error) throw new Error(error.message);

    return NextResponse.json({ preference: data }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo guardar la preferencia." },
      { status: 500 }
    );
  }
}

