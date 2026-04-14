import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type CookieRow = { name: string; value: string; options: CookieOptions };

/**
 * Devuelve el usuario autenticado según cookies (SSR-friendly).
 * Evita depender de `supabase.auth.getUser()` en cliente en Safari/WebViews.
 */
export async function GET() {
  try {
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

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    const res = NextResponse.json({
      ok: !error && !!user,
      userId: user?.id ?? null,
      email: user?.email ?? null,
      error: error?.message ?? null,
    });

    for (const { name, value, options } of cookieWrites) {
      res.cookies.set(name, value, options);
    }

    return res;
  } catch {
    return NextResponse.json({ ok: false, userId: null, email: null, error: "unknown" });
  }
}
