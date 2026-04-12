import { createBrowserClient } from "@supabase/ssr";

/**
 * detectSessionInUrl: false evita que GoTrue canjee ?code= al inicializar el cliente.
 * Si no, AuthListener (layout) y /auth/callback compiten: primer canje OK, el POST a
 * /api/auth/exchange-code falla (código ya usado) y Google OAuth muestra «No se pudo confirmar».
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        detectSessionInUrl: false,
      },
    }
  );
}