"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { withTimeout } from "@/lib/with-timeout";

/**
 * Canjea ?code= vía API en servidor (cookies en la respuesta).
 * No usa el cliente Supabase aquí: en Gmail/WebView getSession/exchange pueden colgarse.
 */
export default function AuthCallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    const next = searchParams.get("next") ?? "/dashboard";
    const type = (searchParams.get("type") || "").toLowerCase();

    if (!code) {
      const q = new URLSearchParams({
        status: "error",
        message: "Falta el código de validación.",
        next,
      });
      q.set("from", "callback");
      router.replace(`/auth/confirmed?${q.toString()}`);
      return;
    }

    const authCode = code;
    const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
    let cancelled = false;

    async function run() {
      let res: Response;
      try {
        res = await withTimeout(
          fetch("/api/auth/exchange-code", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: authCode }),
          }),
          22_000,
          "timeout"
        );
      } catch {
        if (cancelled) return;
        const msg = encodeURIComponent(
          "Tiempo agotado. Abre el enlace en el navegador (Chrome/Safari), no dentro de Gmail. " +
            "Mejor: usa plantillas de correo con token_hash → /auth/verify (ver README)."
        );
        window.location.assign(
          `/auth/confirmed?status=error&message=${msg}&next=${encodeURIComponent(safeNext)}&from=callback`
        );
        return;
      }

      if (cancelled) return;

      const payload = (await res.json().catch(() => null)) as { error?: string; ok?: boolean } | null;

      if (!res.ok || !payload?.ok) {
        const raw = payload?.error || `Error ${res.status}`;
        const msg = encodeURIComponent(raw);
        window.location.assign(
          `/auth/confirmed?status=error&message=${msg}&next=${encodeURIComponent(safeNext)}&from=callback`
        );
        return;
      }

      if (type === "recovery" || safeNext.startsWith("/auth/reset-password")) {
        window.location.assign("/auth/reset-password");
        return;
      }

      window.location.assign(
        `/auth/confirmed?status=ok&next=${encodeURIComponent(safeNext)}`
      );
    }

    void run().catch(() => {
      if (cancelled) return;
      setHint("No se pudo completar la validación. Inténtalo de nuevo.");
    });

    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center text-sm text-slate-600">
      <p>Validando enlace…</p>
      <p className="max-w-sm text-xs text-slate-500">
        Si tarda mucho, pulsa los tres puntos del enlace en Gmail y elige «Abrir en el navegador».
      </p>
      {hint ? <p className="text-red-600">{hint}</p> : null}
    </div>
  );
}
