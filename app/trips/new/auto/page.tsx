import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TripAutoCreationWizard from "@/components/trip-auto/TripAutoCreationWizard";

export const runtime = "nodejs";
export const maxDuration = 60;

export default async function TripAutoNewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profileRow } = await supabase.from("profiles").select("is_premium").eq("id", user.id).maybeSingle();
  const isPremium = Boolean((profileRow as { is_premium?: boolean } | null)?.is_premium);
  if (!isPremium) redirect("/dashboard");

  return (
    <main className="page-shell pb-10">
      <TripAutoCreationWizard />
    </main>
  );
}

