import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError) return NextResponse.json({ error: userError.message }, { status: 401 });
    if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("is_premium, username, email")
      .eq("id", user.id)
      .maybeSingle();

    const { data: subs } = await supabase
      .from("billing_subscriptions")
      .select("status, price_id, current_period_end, cancel_at_period_end, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1);

    return NextResponse.json({
      ok: true,
      user: { id: user.id, email: user.email },
      profile: profileRow || null,
      subscription: Array.isArray(subs) ? subs[0] || null : null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo leer el estado." },
      { status: 500 }
    );
  }
}

