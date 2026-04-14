import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { OAUTH_NEXT_COOKIE, OAUTH_RETURN_COOKIE } from "@/lib/google-oauth-attempt";

export const runtime = "nodejs";

type CookieRow = { name: string; value: string; options: CookieOptions };

function safeNextPath(next: string | null, fallback: string): string {
  const n = next ?? fallback;
  return n.startsWith("/") && !n.startsWith("//") ? n : fallback;
}

/** Google OAuth: redirectTo lleva intent=oauth y next=/dashboard. El correo suele ser solo ?code= sin next. */
function isGoogleOAuthReturn(url: URL): boolean {
  if (url.searchParams.get("intent") === "oauth") return true;
  const type = (url.searchParams.get("type") || "").toLowerCase();
  if (type === "recovery") return false;
  const next = url.searchParams.get("next");
  if (next === "/dashboard" || next?.startsWith("/dashboard?")) return true;
  return false;
}

function clearOauthPendingCookie(res: NextResponse): void {
  res.cookies.set(OAUTH_RETURN_COOKIE, "", { path: "/", maxAge: 0, sameSite: "lax" });
  res.cookies.set(OAUTH_NEXT_COOKIE, "", { path: "/", maxAge: 0, sameSite: "lax" });
}

function redirectConfirmedError(
  origin: string,
  message: string,
  nextPath: string,
  oauthUi: boolean
): NextResponse {
  const u = new URL("/auth/confirmed", origin);
  u.searchParams.set("status", "error");
  u.searchParams.set("message", message);
  u.searchParams.set("next", nextPath);
  u.searchParams.set("from", "callback");
  if (oauthUi) u.searchParams.set("flow", "oauth");
  const res = NextResponse.redirect(u);
  clearOauthPendingCookie(res);
  return res;
}

function redirectWithSessionCookies(
  target: string,
  cookieWrites: CookieRow[]
): NextResponse {
  const res = NextResponse.redirect(target);
  for (const { name, value, options } of cookieWrites) {
    res.cookies.set(name, value, options);
  }
  clearOauthPendingCookie(res);
  return res;
}

/**
 * Único canje PKCE por GET: mismo path que suele tener ya en Supabase Redirect URLs (`/auth/callback`).
 * Evita la página cliente que se quedaba en «Validando enlace…» cuando Google volvía aquí.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;
  const code = requestUrl.searchParams.get("code");
  const type = (requestUrl.searchParams.get("type") || "").toLowerCase();
  const nextParam = requestUrl.searchParams.get("next");
  const cookieStore = await cookies();
  const oauthNextEncoded = cookieStore.get(OAUTH_NEXT_COOKIE)?.value || "";
  let oauthNextFromCookie: string | null = null;
  if (oauthNextEncoded) {
    try {
      const decoded = decodeURIComponent(oauthNextEncoded);
      oauthNextFromCookie = decoded;
    } catch {
      oauthNextFromCookie = null;
    }
  }

  // Si Supabase devuelve a /auth/callback sin `next` (o lo normaliza a `/dashboard`),
  // recuperamos el destino real desde cookie (seteada antes de ir a Google).
  const chosenNext =
    (!nextParam && oauthNextFromCookie) ||
    (nextParam === "/dashboard" && oauthNextFromCookie && oauthNextFromCookie !== "/dashboard")
      ? oauthNextFromCookie
      : nextParam;

  const nextPath = safeNextPath(chosenNext, "/dashboard");

  const oauthCookiePending = cookieStore.get(OAUTH_RETURN_COOKIE)?.value === "1";
  const googleUi = isGoogleOAuthReturn(requestUrl) || oauthCookiePending;

  const oauthErr = requestUrl.searchParams.get("error");
  const oauthDesc = requestUrl.searchParams.get("error_description");
  if (oauthErr || oauthDesc) {
    let text = oauthDesc || oauthErr || "No se pudo completar el acceso.";
    try {
      text = decodeURIComponent(text.replace(/\+/g, " "));
    } catch {
      /* */
    }
    return redirectConfirmedError(origin, text, nextPath, googleUi);
  }

  if (!code) {
    return redirectConfirmedError(
      origin,
      "Falta el código de autorización. Vuelve a intentar desde el login.",
      nextPath,
      googleUi
    );
  }

  const cookieWrites: CookieRow[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(toSet) {
          cookieWrites.push(...toSet);
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return redirectConfirmedError(origin, error.message, nextPath, googleUi);
  }

  if (type === "recovery" || nextPath.startsWith("/auth/reset-password")) {
    return redirectWithSessionCookies(`${origin}/auth/reset-password`, cookieWrites);
  }

  if (googleUi) {
    return redirectWithSessionCookies(`${origin}${nextPath}`, cookieWrites);
  }

  const ok = new URL("/auth/confirmed", origin);
  ok.searchParams.set("status", "ok");
  ok.searchParams.set("next", nextPath);
  return redirectWithSessionCookies(ok.toString(), cookieWrites);
}
