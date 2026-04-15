import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type CookieRow = { name: string; value: string; options: CookieOptions };

function safeNextPath(next: string | null, fallback: string): string {
  const n = next ?? fallback;
  return n.startsWith("/") && !n.startsWith("//") ? n : fallback;
}

function redirectConfirmedError(
  origin: string,
  message: string,
  nextPath: string,
): NextResponse {
  const u = new URL("/auth/confirmed", origin);
  u.searchParams.set("status", "error");
  u.searchParams.set("message", message);
  u.searchParams.set("next", nextPath);
  u.searchParams.set("from", "callback");
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

/** Canje PKCE por GET en `/auth/callback` (redirigidos y magic links). */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;
  const code = requestUrl.searchParams.get("code");
  const type = (requestUrl.searchParams.get("type") || "").toLowerCase();
  const nextParam = requestUrl.searchParams.get("next");
  const cookieStore = await cookies();
  const nextPath = safeNextPath(nextParam, "/dashboard");

  const oauthErr = requestUrl.searchParams.get("error");
  const oauthDesc = requestUrl.searchParams.get("error_description");
  if (oauthErr || oauthDesc) {
    let text = oauthDesc || oauthErr || "No se pudo completar el acceso.";
    try {
      text = decodeURIComponent(text.replace(/\+/g, " "));
    } catch {
      /* */
    }
    return redirectConfirmedError(origin, text, nextPath);
  }

  if (!code) {
    return redirectConfirmedError(
      origin,
      "Falta el código de autorización. Vuelve a intentar desde el login.",
      nextPath
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
    return redirectConfirmedError(origin, error.message, nextPath);
  }

  if (type === "recovery" || nextPath.startsWith("/auth/reset-password")) {
    return redirectWithSessionCookies(`${origin}/auth/reset-password`, cookieWrites);
  }

  const ok = new URL("/auth/confirmed", origin);
  ok.searchParams.set("status", "ok");
  ok.searchParams.set("next", nextPath);
  return redirectWithSessionCookies(ok.toString(), cookieWrites);
}
