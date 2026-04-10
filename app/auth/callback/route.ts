import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/dashboard";

  if (!code) {
    const url = new URL("/auth/confirmed", requestUrl.origin);
    url.searchParams.set("status", "error");
    url.searchParams.set("message", "Falta el código de validación.");
    url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const url = new URL("/auth/confirmed", requestUrl.origin);
      url.searchParams.set("status", "error");
      url.searchParams.set("message", error.message);
      url.searchParams.set("next", next);
      return NextResponse.redirect(url);
    }
    const url = new URL("/auth/confirmed", requestUrl.origin);
    url.searchParams.set("status", "ok");
    url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  } catch (e) {
    const url = new URL("/auth/confirmed", requestUrl.origin);
    url.searchParams.set("status", "error");
    url.searchParams.set("message", e instanceof Error ? e.message : "Error validando la cuenta.");
    url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }
}