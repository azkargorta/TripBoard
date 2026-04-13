import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { isValidUsername, normalizeUsername } from "@/lib/validators/auth";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) return NextResponse.json({ error: userError.message }, { status: 401 });
    if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

    const body = await req.json().catch(() => null);
    const raw = typeof body?.username === "string" ? body.username : "";
    const username = normalizeUsername(raw);

    if (!isValidUsername(username)) {
      return NextResponse.json({ error: "Username inválido." }, { status: 400 });
    }

    const admin = createSupabaseAdmin();
    const { data: existing, error: existingErr } = await admin
      .from("profiles")
      .select("id")
      .ilike("username", username)
      .maybeSingle();
    if (existingErr && existingErr.code !== "PGRST116") throw existingErr;
    if (existing && String(existing.id) !== String(user.id)) {
      return NextResponse.json({ error: "Ese username ya está en uso." }, { status: 409 });
    }

    const { error } = await admin
      .from("profiles")
      .update({ username, updated_at: new Date().toISOString() })
      .eq("id", user.id);
    if (error) throw error;

    return NextResponse.json({ ok: true, username });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo actualizar el username." },
      { status: 500 }
    );
  }
}

