import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type CookieRow = { name: string; value: string; options: CookieOptions };

function safeNextPath(next: string | null): string {
  const n = next ?? "/dashboard";
  return n.startsWith("/") && !n.startsWith("//") ? n : "/dashboard";
}

function redirectConfirmed(
  origin: string,
  message: string,
  nextPath: string
): NextResponse {
  const u = new URL("/auth/confirmed", origin);
  u.searchParams.set("status", "error");
  u.searchParams.set("message", message);
  u.searchParams.set("next", nextPath);
  u.searchParams.set("from", "callback");
  u.searchParams.set("flow", "oauth");
  return NextResponse.redirect(u);
}

/**
 * Google OAuth: canje PKCE en servidor con las cookies de la petición (mismo patrón que /api/auth/exchange-code).
 * Evita el cliente en esta ruta: menos condiciones de carrera y el verificador viaja en Cookie al hacer GET desde Google.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = requestUrl.origin;
  const nextPath = safeNextPath(requestUrl.searchParams.get("next"));
  const code = requestUrl.searchParams.get("code");

  const oauthErr = requestUrl.searchParams.get("error");
  const oauthDesc = requestUrl.searchParams.get("error_description");
  if (oauthErr || oauthDesc) {
    let text = oauthDesc || oauthErr || "Inicio de sesión con Google cancelado.";
    try {
      text = decodeURIComponent(text.replace(/\+/g, " "));
    } catch {
      /* */
    }
    return redirectConfirmed(origin, text, nextPath);
  }

  if (!code) {
    return redirectConfirmed(
      origin,
      "Falta el código de autorización. Prueba de nuevo «Continuar con Google».",
      nextPath
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
    return redirectConfirmed(origin, error.message, nextPath);
  }

  const res = NextResponse.redirect(`${origin}${nextPath}`);
  for (const { name, value, options } of cookieWrites) {
    res.cookies.set(name, value, options);
  }
  return res;
}
