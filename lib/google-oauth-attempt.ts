const KEY = "tripboard_google_oauth_at";
const TTL_MS = 12 * 60 * 1000;

/** Llamar justo antes de ir a Google; sirve si Supabase pierde `intent=oauth` en la URL de vuelta. */
export function markGoogleOAuthAttempt(): void {
  try {
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* */
  }
}

export function clearGoogleOAuthAttempt(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* */
  }
}

export function isRecentGoogleOAuthAttempt(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return false;
    const t = parseInt(raw, 10);
    if (!Number.isFinite(t) || Date.now() - t > TTL_MS) {
      sessionStorage.removeItem(KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
