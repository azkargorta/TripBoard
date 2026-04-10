import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isValidEmail } from "@/lib/validators/auth";

export const runtime = "nodejs";

type CookieRow = { name: string; value: string; options: CookieOptions };

/**
 * Login email/contraseña en servidor y cookies en la respuesta.
 * Evita signInWithPassword en el cliente, que a veces no termina (mismo problema que getSession).
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  const email =
    typeof (body as { email?: string })?.email === "string"
      ? (body as { email: string }).email.trim().toLowerCase()
      : "";
  const password =
    typeof (body as { password?: string })?.password === "string"
      ? (body as { password: string }).password
      : "";

  if (!email || !password) {
    return NextResponse.json({ error: "Email y contraseña son obligatorios." }, { status: 400 });
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Email no válido." }, { status: 400 });
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

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  for (const { name, value, options } of cookieWrites) {
    res.cookies.set(name, value, options);
  }
  return res;
}
