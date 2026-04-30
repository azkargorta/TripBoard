import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { suggestPlacesForCountry } from "@/lib/geocoding/photonGeocode";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

    const body = await req.json().catch(() => null);
    const query = String(body?.query || "").trim();
    const limit = Number(body?.limit) || 18;
    const offset = Number(body?.offset) || 0;
    if (!query) return NextResponse.json({ error: "Falta query." }, { status: 400 });

    const places = await suggestPlacesForCountry(query, { limit, offset });
    return NextResponse.json({ ok: true, places });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo sugerir lugares." }, { status: 500 });
  }
}

