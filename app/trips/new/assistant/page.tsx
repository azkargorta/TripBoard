import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TripCreationWizard from "@/components/trip-wizard/TripCreationWizard";
import { isPlatformAdmin } from "@/lib/platform-admin";

export const runtime = "nodejs";
export const maxDuration = 60;

export default async function TripAssistantWizardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const isAdmin = await isPlatformAdmin(user.id, user.email);

  const { data: profileRow } = await supabase
    .from("profiles")
    .select("is_premium")
    .eq("id", user.id)
    .maybeSingle();
  const isPremium = Boolean((profileRow as any)?.is_premium);

  return (
    <main className="page-shell pb-10">
      <TripCreationWizard isPremium={isPremium} isAdmin={isAdmin} />
    </main>
  );
}

