import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PublicLanding from "@/components/PublicLanding";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return <PublicLanding />;
}