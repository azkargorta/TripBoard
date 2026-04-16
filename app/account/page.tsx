import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TripBoardPremiumHero from "@/components/layout/TripBoardPremiumHero";
import AccountSettingsForm from "@/components/account/AccountSettingsForm";
import Link from "next/link";

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

      <AccountSettingsForm initial={{ username, email, isPremium }} />
    </main>
  );
}

