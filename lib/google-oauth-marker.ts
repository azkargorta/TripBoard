const KEY = "tripboard_oauth_return";
const TTL_MS = 12 * 60 * 1000;

type Payload = { at: number; next: string };

export function markGoogleOAuthReturn(next: string): void {
  try {
    const payload: Payload = { at: Date.now(), next };
    sessionStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* private mode / bloqueo */
  }
}

export function clearGoogleOAuthReturn(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* */
  }
}

/** true si el usuario acaba de pulsar «Google» en esta pestaña (ventana de retorno OAuth). */
export function isRecentGoogleOAuthReturn(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Partial<Payload>;
    if (typeof parsed.at !== "number") return false;
    if (Date.now() - parsed.at > TTL_MS) {
      sessionStorage.removeItem(KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
