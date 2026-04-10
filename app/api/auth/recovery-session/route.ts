import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type CookieRow = { name: string; value: string; options: CookieOptions };

/**
 * Indica si la petición trae sesión de recuperación (cookies tras /auth/verify).
 * Evita depender de getSession() en el cliente, que a veces no termina.
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

    const ok = !error && !!user;
    const res = NextResponse.json({ ok });
    for (const { name, value, options } of cookieWrites) {
      res.cookies.set(name, value, options);
    }
    return res;
  } catch {
    return NextResponse.json({ ok: false });
  }
}
