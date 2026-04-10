"use client";

import { useEffect } from "react";

/**
 * La home no puede usar redirect() en servidor: los enlaces de Supabase a veces
 * apuntan al Site URL con tokens en el hash (#), y el fragmento nunca llega al servidor
 * y se pierde al redirigir a /auth/login.
 */
export default function HomeEntry() {
  useEffect(() => {
    const { hash, search } = window.location;
    const code = new URLSearchParams(search).get("code");

    if (code) {
      const q = new URLSearchParams({
        code,
        next: "/auth/reset-password",
        type: "recovery",
      });
      window.location.replace(`/auth/callback?${q.toString()}`);
      return;
    }

    if (hash && (hash.includes("type=recovery") || hash.includes("access_token"))) {
      window.location.replace(`/auth/reset-password${hash}`);
      return;
    }

    window.location.replace("/auth/login");
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600">
      Redirigiendo…
    </div>
  );
}
