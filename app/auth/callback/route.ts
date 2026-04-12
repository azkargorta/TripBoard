import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

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
  return NextResponse.redirect(u);
}

function redirectWithSessionCookies(
  target: string,
  cookieWrites: CookieRow[]
): NextResponse {
  const res = NextResponse.redirect(target);
  for (const { name, value, options } of cookieWrites) {
    res.cookies.set(name, value, options);
  }
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
  const nextRaw = requestUrl.searchParams.get("next");
  const nextPath = safeNextPath(nextRaw, "/dashboard");
  const googleUi = isGoogleOAuthReturn(requestUrl);

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

  const cookieStore = await cookies();
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
