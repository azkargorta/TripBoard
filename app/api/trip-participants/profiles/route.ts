import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = (searchParams.get("query") || "").trim();
    if (!query) return NextResponse.json({ profiles: [] });

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

    const { data, error } = await supabase
      .from("profiles")
      .select("id, username, email, full_name")
      .or(`username.ilike.%${query}%,email.ilike.%${query}%`)
      .limit(8);

    if (error) throw new Error(error.message);

    return NextResponse.json({ profiles: data || [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudieron buscar perfiles." },
      { status: 500 }
    );
  }
}

