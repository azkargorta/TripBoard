import { createClient } from "@supabase/supabase-js";

/**
 * Solo para `resetPasswordForEmail`. @supabase/ssr fuerza PKCE en el cliente
 * habitual; PKCE exige abrir el enlace en el mismo navegador donde se pidió el reset.
 * Flujo implícito: el email trae tokens en el hash (#) y sirve en cualquier dispositivo.
 */
export function createRecoveryEmailClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: "implicit",
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );
}
