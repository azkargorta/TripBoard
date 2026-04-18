import type { SupabaseClient } from "@supabase/supabase-js";

export const FREE_TRIP_LIMIT = 3;

/** Comprueba límite de viajes en plan gratuito (misma regla que POST /api/trips). */
export async function ensureUserCanCreateTrip(
  supabase: SupabaseClient,
  userId: string
): Promise<{ ok: true; isPremium: boolean } | { error: string; code: "PREMIUM_REQUIRED" }> {
  const { data: profileRow } = await supabase.from("profiles").select("is_premium").eq("id", userId).maybeSingle();
  const isPremium = Boolean((profileRow as { is_premium?: boolean } | null)?.is_premium);

  if (isPremium) return { ok: true, isPremium: true };

  const { data: existing, error: countErr } = await supabase
    .from("trip_participants")
    .select("trip_id")
    .eq("user_id", userId)
    .neq("status", "removed");
  if (countErr) {
    return { error: countErr.message, code: "PREMIUM_REQUIRED" };
  }
  const existingCount = Array.isArray(existing) ? existing.length : 0;
  if (existingCount >= FREE_TRIP_LIMIT) {
    return {
      error: `El plan gratuito permite hasta ${FREE_TRIP_LIMIT} viajes. Hazte Premium para crear más viajes.`,
      code: "PREMIUM_REQUIRED",
    };
  }
  return { ok: true, isPremium: false };
}
