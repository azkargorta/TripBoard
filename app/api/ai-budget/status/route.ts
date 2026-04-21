import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMonthlyAiBudgetEur, monthKeyUtc } from "@/lib/ai-usage";

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

    const monthKey = monthKeyUtc();
    const monthlyBudgetEur = getMonthlyAiBudgetEur();

    const { data: usageRow, error: usageErr } = await supabase
      .from("user_ai_usage_monthly")
      .select("estimated_cost_eur")
      .eq("user_id", user.id)
      .eq("month_key", monthKey)
      .eq("provider", "gemini")
      .maybeSingle();
    if (usageErr) throw usageErr;

    let currentEstimatedEur = usageRow?.estimated_cost_eur != null ? Number(usageRow.estimated_cost_eur) : 0;
    if (!Number.isFinite(currentEstimatedEur)) currentEstimatedEur = 0;
    const usagePct =
      monthlyBudgetEur > 0 ? Math.min(100, Math.max(0, (currentEstimatedEur / monthlyBudgetEur) * 100)) : 0;
    const exceeded = currentEstimatedEur >= monthlyBudgetEur && monthlyBudgetEur > 0;

    return NextResponse.json({
      ok: true,
      monthKey,
      monthlyBudgetEur,
      currentEstimatedEur,
      usagePct,
      exceeded,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo leer el presupuesto de IA." },
      { status: 500 }
    );
  }
}

