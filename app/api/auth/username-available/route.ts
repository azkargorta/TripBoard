import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { normalizeUsername, isValidUsername } from "@/lib/validators/auth";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const raw = searchParams.get("username") || "";
    const username = normalizeUsername(raw);

    if (!isValidUsername(username)) {
      return NextResponse.json({ available: false, error: "username inválido" }, { status: 400 });
    }

    const admin = createSupabaseAdmin();
    const { data, error } = await admin.from("profiles").select("id").ilike("username", username).maybeSingle();
    if (error && error.code !== "PGRST116") throw error;

    return NextResponse.json({ available: !data });
  } catch (e) {
    return NextResponse.json(
      { available: false, error: e instanceof Error ? e.message : "No se pudo comprobar el username." },
      { status: 500 }
    );
  }
}

