import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TripBoardPremiumHero from "@/components/layout/TripBoardPremiumHero";
import AccountSettingsForm from "@/components/account/AccountSettingsForm";
import Link from "next/link";
import { getMonthlyAiBudgetEur, monthKeyUtc } from "@/lib/ai-usage";

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login?next=/account");

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("username, email, is_premium")
    .eq("id", user.id)
    .maybeSingle();

  const username = typeof (profileRow as any)?.username === "string" ? String((profileRow as any).username) : "";
  const email = user.email || (typeof (profileRow as any)?.email === "string" ? String((profileRow as any).email) : "");
  const isPremium = Boolean((profileRow as any)?.is_premium);

  const monthKey = monthKeyUtc();
  const monthlyBudgetEur = getMonthlyAiBudgetEur();
  let estimatedCostEur = 0;
  let usagePct = 0;
  if (isPremium) {
    const { data: usageRow } = await supabase
      .from("user_ai_usage_monthly")
      .select("estimated_cost_eur")
      .eq("user_id", user.id)
      .eq("month_key", monthKey)
      .eq("provider", "gemini")
      .maybeSingle();
    estimatedCostEur = usageRow?.estimated_cost_eur != null ? Number(usageRow.estimated_cost_eur) : 0;
    if (!Number.isFinite(estimatedCostEur)) estimatedCostEur = 0;
    usagePct = monthlyBudgetEur > 0 ? Math.min(100, Math.max(0, (estimatedCostEur / monthlyBudgetEur) * 100)) : 0;
  }

  return (
    <main className="page-shell space-y-8">
      <TripBoardPremiumHero
        eyebrow="Cuenta"
        title="Tu cuenta"
        description="Gestiona tu plan, credenciales y nombre de usuario."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/pricing"
              className="inline-flex min-h-[44px] items-center justify-center rounded-2xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
            >
              Precios
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex min-h-[44px] items-center justify-center rounded-2xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
            >
              Volver al dashboard
            </Link>
          </div>
        }
      />

      {isPremium ? (
        <section className="card-soft p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-extrabold uppercase tracking-[0.14em] text-slate-600">Uso de IA este mes</h2>
              <p className="mt-1 text-sm text-slate-600">
                Límite: <span className="font-semibold">{monthlyBudgetEur.toFixed(2)}€</span> · Consumido:{" "}
                <span className="font-semibold">{estimatedCostEur.toFixed(2)}€</span>
              </p>
              <p className="mt-1 text-xs text-slate-500">Mes: {monthKey}</p>
            </div>
            <div className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
              {Math.round(usagePct)}%
            </div>
          </div>

          <div className="mt-4">
            <div className="h-4 w-full overflow-hidden rounded-full border border-slate-200 bg-emerald-100">
              <div className="h-full bg-rose-500" style={{ width: `${usagePct}%` }} aria-hidden />
            </div>
            {usagePct >= 100 ? (
              <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                <span className="font-semibold">Has alcanzado el límite mensual de IA.</span> El asistente y el analizador de
                documentos quedan deshabilitados hasta el mes siguiente.
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <AccountSettingsForm initial={{ username, email, isPremium }} />
    </main>
  );
}

