import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { monthKeyUtc } from "@/lib/ai-usage";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    }
    if (!(await isPlatformAdmin(user.id, user.email))) {
      return NextResponse.json({ error: "Sin permisos de administrador." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const monthKey = searchParams.get("month")?.trim() || monthKeyUtc();

    const admin = createSupabaseAdmin();
    const { data: rows, error } = await admin
      .from("user_ai_usage_monthly")
      .select("user_id, month_key, provider, model, requests_count, input_tokens, output_tokens, estimated_cost_eur, last_request_at")
      .eq("month_key", monthKey)
      .order("estimated_cost_eur", { ascending: false });
    if (error) throw error;

    const userIds = [...new Set((rows ?? []).map((r: { user_id: string }) => r.user_id))];
    let emailById: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await admin.from("profiles").select("id, email, username, full_name").in("id", userIds);
      for (const p of profiles ?? []) {
        const row = p as { id: string; email: string | null; username: string | null; full_name: string | null };
        emailById[row.id] = row.email || row.username || row.full_name || row.id;
      }
    }

    const enriched = (rows ?? []).map((r: any) => ({
      ...r,
      user_label: emailById[r.user_id] ?? r.user_id,
    }));

    return NextResponse.json({ monthKey, rows: enriched });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al cargar uso del asistente personal." },
      { status: 500 }
    );
  }
}
