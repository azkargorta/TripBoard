import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

const OTP_TYPES = ["recovery", "signup", "email"] as const;
type OtpType = (typeof OTP_TYPES)[number];

function isOtpType(s: string): s is OtpType {
  return (OTP_TYPES as readonly string[]).includes(s);
}

/**
 * Validación sin PKCE vía token_hash en el correo (plantillas en Supabase).
 * - recovery → /auth/reset-password
 * - signup | email → cuenta confirmada (pantalla ok → login)
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const token_hash = requestUrl.searchParams.get("token_hash");
  const typeRaw = requestUrl.searchParams.get("type");
  const nextRaw = requestUrl.searchParams.get("next") ?? "/dashboard";

  if (!token_hash || !typeRaw || !isOtpType(typeRaw)) {
    const u = new URL("/auth/confirmed", requestUrl.origin);
    u.searchParams.set("status", "error");
    u.searchParams.set(
      "message",
      "Enlace incompleto o tipo no válido. Si el correo usa el enlace antiguo (PKCE), actualiza las plantillas en Supabase o pide un correo nuevo."
    );
    return NextResponse.redirect(u);
  }

  const safeNext =
    nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "/dashboard";

  const successUrl =
    typeRaw === "recovery"
      ? new URL("/auth/reset-password", requestUrl.origin)
      : (() => {
          const u = new URL("/auth/confirmed", requestUrl.origin);
          u.searchParams.set("status", "ok");
          u.searchParams.set("next", safeNext);
          return u;
        })();

  let response = NextResponse.redirect(successUrl);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { error } = await supabase.auth.verifyOtp({
    type: typeRaw,
    token_hash,
  });

  if (error) {
    const u = new URL("/auth/confirmed", requestUrl.origin);
    u.searchParams.set("status", "error");
    u.searchParams.set("message", error.message);
    u.searchParams.set("next", safeNext);
    return NextResponse.redirect(u);
  }

  return response;
}
