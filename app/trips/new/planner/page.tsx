import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TripAiPlannerWizard from "@/components/trip-planner/TripAiPlannerWizard";

export const runtime = "nodejs";
export const maxDuration = 60;

export default async function NewTripPlannerPage() {
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
      <TripAiPlannerWizard />
    </main>
  );
}

