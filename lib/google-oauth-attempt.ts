const KEY = "tripboard_google_oauth_at";
const TTL_MS = 12 * 60 * 1000;

/** Cookie que SÍ envía el navegador en GET /auth/callback (Supabase suele borrar query params del redirectTo). */
export const OAUTH_RETURN_COOKIE = "tripboard_oauth";

function setOauthReturnCookie(): void {
  if (typeof document === "undefined") return;
  const maxAge = 600;
  const bits = [`${OAUTH_RETURN_COOKIE}=1`, "path=/", `max-age=${maxAge}`, "SameSite=Lax"];
  if (window.location.protocol === "https:") bits.push("Secure");
  try {
    document.cookie = bits.join("; ");
  } catch {
    /* */
  }
}

function clearOauthReturnCookie(): void {
  if (typeof document === "undefined") return;
  try {
    const bits = [`${OAUTH_RETURN_COOKIE}=`, "path=/", "max-age=0", "SameSite=Lax"];
    if (window.location.protocol === "https:") bits.push("Secure");
    document.cookie = bits.join("; ");
  } catch {
    /* */
  }
}

/** Llamar justo antes de ir a Google: sessionStorage (UI) + cookie (servidor en /auth/callback). */
export function markGoogleOAuthAttempt(): void {
  try {
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* */
  }
  setOauthReturnCookie();
}

export function clearGoogleOAuthAttempt(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* */
  }
  clearOauthReturnCookie();
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
