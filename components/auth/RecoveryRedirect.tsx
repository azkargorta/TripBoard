"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Punto de entrada del enlace de "recuperar contraseña".
 * Supabase puede añadir ?code= (PKCE) o #access_token=... (implicit).
 * Aquí normalizamos hacia /auth/callback o /auth/reset-password.
 */
export default function RecoveryRedirect() {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const u = new URL(window.location.href);
    const code = u.searchParams.get("code");
    const type = (u.searchParams.get("type") || "").toLowerCase();
    const hash = u.hash || "";

    if (code) {
      const next = encodeURIComponent("/auth/reset-password");
      const typeQ = type ? `&type=${encodeURIComponent(type)}` : "";
      window.location.replace(`${u.origin}/auth/callback?code=${encodeURIComponent(code)}&next=${next}${typeQ}`);
      return;
    }

    if (hash && (hash.includes("type=recovery") || hash.includes("access_token"))) {
      window.location.replace(`${u.origin}/auth/reset-password${hash}`);
      return;
    }

    setStuck(true);
  }, []);

  if (!stuck) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        Redirigiendo al restablecimiento de contraseña…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <p className="font-semibold">Enlace incompleto o caducado</p>
        <p className="mt-1 opacity-90">
          Pide un nuevo email de recuperación. En Supabase, añade también{" "}
          <span className="font-mono text-xs">/auth/recovery</span> en URL Configuration → Redirect URLs.
        </p>
      </div>
      <Link
        href="/auth/forgot-password"
        className="inline-flex w-full min-h-[44px] items-center justify-center rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-md hover:from-violet-700 hover:to-indigo-700"
      >
        Volver a solicitar recuperación
      </Link>
      <Link
        href="/auth/login"
        className="block text-center text-sm font-semibold text-violet-600 hover:text-violet-700"
      >
        Ir al inicio de sesión
      </Link>
    </div>
  );
}
