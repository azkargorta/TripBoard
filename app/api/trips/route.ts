import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createTripWithOwner } from "@/lib/trips/createTripWithOwner";
import { ensureUserCanCreateTrip } from "@/lib/trips/tripCreationLimits";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      return NextResponse.json({ error: userError.message }, { status: 401 });
    }
    if (!user) {
      return NextResponse.json({ error: "No hay sesión activa." }, { status: 401 });
    }

    const gate = await ensureUserCanCreateTrip(supabase, user.id);
    if ("error" in gate) {
      return NextResponse.json({ error: gate.error, code: gate.code }, { status: 402 });
    }

    const body = await req.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const destination = typeof body?.destination === "string" ? body.destination.trim() : "";
    const start_date = typeof body?.start_date === "string" ? body.start_date : null;
    const end_date = typeof body?.end_date === "string" ? body.end_date : null;
    const base_currency = typeof body?.base_currency === "string" ? body.base_currency.trim().toUpperCase() : "EUR";

    if (!name) return NextResponse.json({ error: "El nombre del viaje es obligatorio." }, { status: 400 });
    if (start_date && end_date && start_date > end_date) {
      return NextResponse.json({ error: "La fecha de inicio no puede ser posterior a la fecha de fin." }, { status: 400 });
    }

    const created = await createTripWithOwner(supabase, user, {
      name,
      destination: destination || null,
      start_date,
      end_date,
      base_currency: /^[A-Z]{3}$/.test(base_currency) ? base_currency : "EUR",
    });

    if ("error" in created) {
      return NextResponse.json({ error: created.error }, { status: 400 });
    }

    return NextResponse.json({ tripId: created.tripId }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo crear el viaje." },
      { status: 500 }
    );
  }
}

