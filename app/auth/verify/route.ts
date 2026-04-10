import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Recuperación sin PKCE: la plantilla de email en Supabase debe enlazar aquí con
 * token_hash (ver README_DEPLOY_VERCEL.md). Así el enlace funciona en cualquier dispositivo.
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const token_hash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");

  if (!token_hash || type !== "recovery") {
    const u = new URL("/auth/confirmed", requestUrl.origin);
    u.searchParams.set("status", "error");
    u.searchParams.set(
      "message",
      "Enlace incompleto. Si el correo es antiguo, pide otro desde «Olvidé mi contraseña»."
    );
    return NextResponse.redirect(u);
  }

  const successUrl = new URL("/auth/reset-password", requestUrl.origin);
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
    type: "recovery",
    token_hash,
  });

  if (error) {
    const u = new URL("/auth/confirmed", requestUrl.origin);
    u.searchParams.set("status", "error");
    u.searchParams.set("message", error.message);
    return NextResponse.redirect(u);
  }

  return response;
}
