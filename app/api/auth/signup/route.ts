import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { isValidEmail, isValidPassword, isValidUsername, normalizeUsername } from "@/lib/validators/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const username = normalizeUsername(typeof body?.username === "string" ? body.username : "");
    const email = (typeof body?.email === "string" ? body.email : "").trim().toLowerCase();
    const password = typeof body?.password === "string" ? body.password : "";

    if (!isValidUsername(username)) {
      return NextResponse.json({ error: "Username inválido." }, { status: 400 });
    }
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Email inválido." }, { status: 400 });
    }
    if (!isValidPassword(password)) {
      return NextResponse.json({ error: "La contraseña debe tener al menos 8 caracteres." }, { status: 400 });
    }

    const admin = createSupabaseAdmin();

    // Username único (server-side)
    const { data: existingProfile, error: profileErr } = await admin
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle();
    if (profileErr && profileErr.code !== "PGRST116") throw profileErr;
    if (existingProfile) {
      return NextResponse.json({ error: "Ese nombre de usuario ya está en uso." }, { status: 409 });
    }

    // Crear usuario directamente (sin depender de SMTP/confirmación).
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username },
    });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Asegurar perfil (si el trigger no está instalado aún, lo garantizamos aquí).
    if (data?.user?.id) {
      await admin.from("profiles").upsert(
        {
          id: data.user.id,
          username,
          email,
          full_name: null,
          avatar_url: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo crear la cuenta." },
      { status: 500 }
    );
  }
}

