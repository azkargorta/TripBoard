import { supabase } from "@/lib/supabase";
import { normalizeUsername } from "@/lib/validators/auth";

export type Profile = {
  id: string;
  username: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export async function isUsernameAvailable(username: string) {
  const normalized = normalizeUsername(username);

  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .ilike("username", normalized)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw error;
  }

  return !data;
}

export async function getMyProfile() {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) throw authError;
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw error;

  return (data as Profile | null) ?? null;
}

export async function upsertProfile(input: {
  id: string;
  username: string;
  email: string;
  full_name?: string | null;
  avatar_url?: string | null;
}) {
  const payload = {
    id: input.id,
    username: normalizeUsername(input.username),
    email: input.email.trim().toLowerCase(),
    full_name: input.full_name ?? null,
    avatar_url: input.avatar_url ?? null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("profiles").upsert(payload);

  if (error) throw error;
}

export function buildUsernameFromEmail(email: string) {
  const base = email
    .split("@")[0]
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 20);

  return base || `user_${Math.random().toString(36).slice(2, 8)}`;
}

export async function ensureProfileForOAuthUser(params: {
  id: string;
  email: string;
  full_name?: string | null;
  avatar_url?: string | null;
}) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", params.id)
    .maybeSingle();

  if (error) throw error;
  if (data) return;

  let usernameBase = buildUsernameFromEmail(params.email);
  let candidate = usernameBase;
  let counter = 0;

  while (!(await isUsernameAvailable(candidate))) {
    counter += 1;
    candidate = `${usernameBase.slice(0, Math.max(1, 20 - String(counter).length))}${counter}`;
  }

  await upsertProfile({
    id: params.id,
    email: params.email,
    username: candidate,
    full_name: params.full_name ?? null,
    avatar_url: params.avatar_url ?? null,
  });
}