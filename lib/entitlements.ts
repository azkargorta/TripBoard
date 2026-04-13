import { createClient } from "@/lib/supabase/server";

export type Entitlements = {
  isPremium: boolean;
};

export async function getMyEntitlements(): Promise<Entitlements> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { isPremium: false };

  const { data, error } = await supabase
    .from("profiles")
    .select("is_premium")
    .eq("id", user.id)
    .maybeSingle();

  // Si la columna aún no existe en la BD, asumimos free.
  if (error) return { isPremium: false };

  return { isPremium: Boolean((data as any)?.is_premium) };
}

export async function requirePremiumOrThrow() {
  const ent = await getMyEntitlements();
  if (!ent.isPremium) {
    const err = new Error("Necesitas Premium para usar esta función.");
    (err as any).code = "PREMIUM_REQUIRED";
    (err as any).httpStatus = 402;
    throw err;
  }
  return ent;
}

