import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TripBoardPremiumHero from "@/components/layout/TripBoardPremiumHero";
import AccountSettingsForm from "@/components/account/AccountSettingsForm";

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
      />

      <AccountSettingsForm initial={{ username, email, isPremium }} />
    </main>
  );
}

