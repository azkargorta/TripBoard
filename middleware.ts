import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Refresca la sesión Supabase en cookies entre peticiones.
 * Sin esto, tras /auth/verify el cliente a veces no ve la sesión y updateUser puede colgarse.
 */
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/).*)",
  ],
};
