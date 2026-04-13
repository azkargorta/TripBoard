import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

    // Free tier: solo 1 viaje activo (el último). Para evitar gasto/carga, bloqueamos crear más viajes sin premium.
    const { data: profileRow } = await supabase
      .from("profiles")
      .select("is_premium")
      .eq("id", user.id)
      .maybeSingle();
    const isPremium = Boolean((profileRow as any)?.is_premium);

    if (!isPremium) {
      const { data: existing, error: countErr } = await supabase
        .from("trip_participants")
        .select("trip_id")
        .eq("user_id", user.id)
        .neq("status", "removed");
      if (countErr) {
        return NextResponse.json({ error: countErr.message }, { status: 500 });
      }
      const existingCount = Array.isArray(existing) ? existing.length : 0;
      if (existingCount >= 1) {
        return NextResponse.json(
          { error: "El plan gratuito solo permite 1 viaje activo. Hazte Premium para crear más viajes.", code: "PREMIUM_REQUIRED" },
          { status: 402 }
        );
      }
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

    const tripInsert = await supabase
      .from("trips")
      .insert({
        name,
        destination: destination || null,
        start_date,
        end_date,
        base_currency: /^[A-Z]{3}$/.test(base_currency) ? base_currency : "EUR",
      })
      .select("id")
      .single();

    if (tripInsert.error || !tripInsert.data) {
      throw new Error(tripInsert.error?.message || "No se pudo crear el viaje.");
    }

    const tripId = String(tripInsert.data.id);

    const participantInsert = await supabase.from("trip_participants").insert({
      trip_id: tripId,
      display_name:
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.user_metadata?.username ||
        user.email ||
        "Usuario",
      username: user.user_metadata?.username || user.email?.split("@")[0] || null,
      joined_via: "owner",
      user_id: user.id,
      role: "owner",
    });

    if (participantInsert.error) {
      await supabase.from("trips").delete().eq("id", tripId);
      throw new Error(participantInsert.error.message);
    }

    return NextResponse.json({ tripId }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo crear el viaje." },
      { status: 500 }
    );
  }
}

