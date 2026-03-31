import type { createClient as createBrowserSupabaseClient } from "@/lib/supabase/client";
import { createClient } from "@/lib/supabase/client";

type BrowserSupabaseClient = ReturnType<typeof createBrowserSupabaseClient>;

let browserClient: BrowserSupabaseClient | null = null;

function getSupabaseUrl() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!value) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local"
    );
  }
  return value;
}

function getSupabaseAnonKey() {
  const value = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!value) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local"
    );
  }
  return value;
}

export function getSupabase(): BrowserSupabaseClient {
  getSupabaseUrl();
  getSupabaseAnonKey();

  if (!browserClient) {
    browserClient = createClient();
  }

  return browserClient;
}

export const supabase = new Proxy({} as BrowserSupabaseClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getSupabase(), prop, receiver);
  },
  set(_target, prop, value, receiver) {
    return Reflect.set(getSupabase(), prop, value, receiver);
  },
}) as BrowserSupabaseClient;
