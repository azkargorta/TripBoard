import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type CookieRow = { name: string; value: string; options: CookieOptions };

/**
 * Logout server-side: invalida la sesión y escribe cookies en la respuesta.
 * Es más fiable que signOut() en cliente cuando la sesión vive en cookies HttpOnly.
 */
export async function POST() {
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

  await supabase.auth.signOut().catch(() => {
    // si falla, igualmente devolvemos respuesta y limpiamos cookies
  });

  const res = NextResponse.json({ ok: true });
  for (const { name, value, options } of cookieWrites) {
    res.cookies.set(name, value, options);
  }
  return res;
}

