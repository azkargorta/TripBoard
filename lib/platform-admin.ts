import { createSupabaseAdmin } from "@/lib/supabase-admin";

function adminEmailsFromEnv(): string[] {
  const raw = process.env.TRIPBOARD_ADMIN_EMAILS || "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export async function isPlatformAdmin(userId: string, email?: string | null): Promise<boolean> {
  if (email) {
    const list = adminEmailsFromEnv();
    if (list.includes(email.trim().toLowerCase())) return true;
  }

  try {
    const admin = createSupabaseAdmin();
    const { data, error } = await admin.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle();
    if (error) return false;
    return Boolean(data?.user_id);
  } catch {
    return false;
  }
}
