import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let serviceClient: SupabaseClient | null = null;

export function getServiceRoleClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY o NEXT_PUBLIC_SUPABASE_URL para operaciones server-side.");
  }

  if (!serviceClient) {
    serviceClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }

  return serviceClient;
}
