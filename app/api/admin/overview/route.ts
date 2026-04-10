import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { monthKeyUtc } from "@/lib/ai-usage";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
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

    const admin = createSupabaseAdmin();
    const monthKey = monthKeyUtc();

    const [{ count: profileCount }, { count: tripCount }, { data: aiMonth }] = await Promise.all([
      admin.from("profiles").select("id", { count: "exact", head: true }),
      admin.from("trips").select("id", { count: "exact", head: true }),
      admin.from("user_ai_usage_monthly").select("user_id, estimated_cost_eur, requests_count").eq("month_key", monthKey),
    ]);

    const aiRows = aiMonth ?? [];
    let aiTotalEur = 0;
    let aiTotalRequests = 0;
    const aiUserIds = new Set<string>();
    for (const r of aiRows as {
      user_id: string;
      estimated_cost_eur: string | number | null;
      requests_count: number | null;
    }[]) {
      aiTotalEur += Number(r.estimated_cost_eur ?? 0);
      aiTotalRequests += Number(r.requests_count ?? 0);
      if (r.user_id) aiUserIds.add(r.user_id);
    }

    const since7 = new Date();
    since7.setUTCDate(since7.getUTCDate() - 7);
    const { count: views7 } = await admin
      .from("site_page_views")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since7.toISOString());

    return NextResponse.json({
      monthKey,
      counts: {
        profiles: profileCount ?? 0,
        trips: tripCount ?? 0,
        pageViewsLast7Days: views7 ?? 0,
      },
      aiThisMonth: {
        usersWithUsage: aiUserIds.size,
        requestsTotal: aiTotalRequests,
        estimatedCostEurSum: Math.round(aiTotalEur * 1_000_000) / 1_000_000,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al cargar resumen." },
      { status: 500 }
    );
  }
}
