import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALL_METHODS = ["bizum", "transfer", "cash"] as const;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const tripId = typeof body?.tripId === "string" ? body.tripId : "";
    const participants: string[] = Array.isArray(body?.participants)
      ? body.participants.map((v: unknown) => String(v))
      : [];

    if (!tripId) return NextResponse.json({ error: "Falta tripId" }, { status: 400 });
    if (!participants.length) return NextResponse.json({ error: "Faltan participants" }, { status: 400 });

    const access = await requireTripAccess(tripId);
    if (access.role === "viewer") {
      return NextResponse.json({ error: "No tienes permisos para configurar reglas." }, { status: 403 });
    }

    const supabase = await createClient();
    const now = new Date().toISOString();

    const names = participants
      .map((n: string) => String(n || "").trim())
      .filter(Boolean);
    const unique = Array.from(new Set(names));

    const prefsRows = unique.map((name) => ({
      trip_id: tripId,
      participant_name: name,
      send_methods: [...ALL_METHODS],
      receive_methods: [...ALL_METHODS],
      updated_at: now,
    }));

    const pairRows: Array<{
      trip_id: string;
      from_participant_name: string;
      to_participant_name: string;
      allowed: boolean;
      prefer: boolean;
      updated_at: string;
    }> = [];
    for (const fromName of unique) {
      for (const toName of unique) {
        if (fromName === toName) continue;
        pairRows.push({
          trip_id: tripId,
          from_participant_name: fromName,
          to_participant_name: toName,
          allowed: true,
          prefer: false,
          updated_at: now,
        });
      }
    }

    // upsert: no necesita policies delete
    const [prefsRes, pairRes] = await Promise.all([
      supabase
        .from("trip_payment_preferences")
        .upsert(prefsRows, { onConflict: "trip_id,participant_name" }),
      pairRows.length
        ? supabase
            .from("trip_payment_pair_rules")
            .upsert(pairRows, { onConflict: "trip_id,from_participant_name,to_participant_name" })
        : Promise.resolve({ error: null } as any),
    ]);

    if (prefsRes?.error) throw new Error(prefsRes.error.message);
    if (pairRes?.error) throw new Error(pairRes.error.message);

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo restablecer todo." },
      { status: 500 }
    );
  }
}

