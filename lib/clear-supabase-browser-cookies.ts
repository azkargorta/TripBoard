/**
 * Borra cookies visibles en document.cookie cuyo nombre empieza por `sb-`
 * (sesión y PKCE de @supabase/ssr en el navegador). HttpOnly no aparece aquí.
 * Solo usar en pantallas donde no haya sesión que conservar (login/registro).
 */
export function clearSupabaseBrowserCookies(): void {
  if (typeof document === "undefined") return;
  const secure = window.location.protocol === "https:";
  const tail = secure ? "; SameSite=Lax; Secure" : "; SameSite=Lax";

  const raw = document.cookie.split(";");
  for (const part of raw) {
    const name = part.split("=")[0]?.trim();
    if (!name || !name.startsWith("sb-")) continue;
    document.cookie = `${name}=; path=/; max-age=0${tail}`;
  }
}
