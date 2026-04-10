import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const path = typeof body?.path === "string" ? body.path.slice(0, 2048) : "";
    if (!path || !path.startsWith("/")) {
      return NextResponse.json({ error: "path inválido" }, { status: 400 });
    }

    const referrer = typeof body?.referrer === "string" ? body.referrer.slice(0, 2048) : null;
    const userAgent = typeof body?.userAgent === "string" ? body.userAgent.slice(0, 512) : null;

    const { error } = await supabase.from("site_page_views").insert({
      user_id: user.id,
      path,
      referrer,
      user_agent: userAgent,
    });
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo registrar la visita." },
      { status: 500 }
    );
  }
}
