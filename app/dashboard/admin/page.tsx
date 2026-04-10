import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/platform-admin";
import AdminPanel from "@/components/admin/AdminPanel";

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/auth/login?next=/dashboard/admin");
  }
  if (!(await isPlatformAdmin(user.id, user.email))) {
    redirect("/dashboard");
  }
  return <AdminPanel />;
}
