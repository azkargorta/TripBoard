const KEY = "tripboard_google_oauth_at";
const TTL_MS = 12 * 60 * 1000;

/** Cookie que SÍ envía el navegador en GET /auth/callback (Supabase suele borrar query params del redirectTo). */
export const OAUTH_RETURN_COOKIE = "tripboard_oauth";

/**
 * Cookie auxiliar: si Supabase/Google pierde `next` en la vuelta a `/auth/callback`,
 * el servidor puede reconstruir el destino (p.ej. `/invite/<token>`).
 */
export const OAUTH_NEXT_COOKIE = "tripboard_oauth_next";

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

function setOauthNextCookie(next: string): void {
  if (typeof document === "undefined") return;
  const maxAge = 600;
  const safe = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  const encoded = encodeURIComponent(safe);
  // Evita cookies gigantes (límite práctico ~4KB); las rutas de invite caben sobradas.
  if (encoded.length > 1800) return;
  const bits = [`${OAUTH_NEXT_COOKIE}=${encoded}`, "path=/", `max-age=${maxAge}`, "SameSite=Lax"];
  if (window.location.protocol === "https:") bits.push("Secure");
  try {
    document.cookie = bits.join("; ");
  } catch {
    /* */
  }
}

function clearOauthNextCookie(): void {
  if (typeof document === "undefined") return;
  try {
    const bits = [`${OAUTH_NEXT_COOKIE}=`, "path=/", "max-age=0", "SameSite=Lax"];
    if (window.location.protocol === "https:") bits.push("Secure");
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
export function markGoogleOAuthAttempt(next?: string): void {
  try {
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* */
  }
  setOauthReturnCookie();
  if (typeof next === "string" && next.trim()) {
    setOauthNextCookie(next.trim());
  } else {
    clearOauthNextCookie();
  }
}

export function clearGoogleOAuthAttempt(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* */
  }
  clearOauthReturnCookie();
  clearOauthNextCookie();
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
