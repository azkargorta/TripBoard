"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { withTimeout } from "@/lib/with-timeout";

/**
 * Solo flujos que terminan en /auth/callback con ?code= (p. ej. recuperación PKCE antigua).
 * Google OAuth usa GET /auth/oauth/callback (route handler en servidor).
 */
export default function AuthCallbackClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    const oauthError = searchParams.get("error");
    const oauthDesc = searchParams.get("error_description");
    const code = searchParams.get("code");
    const next = searchParams.get("next") ?? "/dashboard";
    const type = (searchParams.get("type") || "").toLowerCase();
    const flow = searchParams.get("flow") || "";
    const flowQs = flow ? `&flow=${encodeURIComponent(flow)}` : "";
    const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

    if (oauthError || oauthDesc) {
      const raw = oauthDesc || oauthError || "";
      let text = raw;
      try {
        text = decodeURIComponent(raw.replace(/\+/g, " "));
      } catch {
        /* */
      }
      const msg = encodeURIComponent(text || "Error al validar el enlace.");
      const q = new URLSearchParams({
        status: "error",
        message: msg,
        next: safeNext,
        from: "callback",
      });
      if (flow) q.set("flow", flow);
      router.replace(`/auth/confirmed?${q.toString()}`);
      return;
    }

    if (!code) {
      const q = new URLSearchParams({
        status: "error",
        message: encodeURIComponent("Falta el código de validación."),
        next: safeNext,
        from: "callback",
      });
      if (flow) q.set("flow", flow);
      router.replace(`/auth/confirmed?${q.toString()}`);
      return;
    }

    const authCode = code;
    let cancelled = false;

    async function run() {
      const supabase = createClient();
      let exchangeError: string | null = null;
      try {
        const { error } = await withTimeout(
          supabase.auth.exchangeCodeForSession(authCode),
          22_000,
          "timeout"
        );
        if (error) exchangeError = error.message;
      } catch (e) {
        exchangeError =
          e instanceof Error && e.message === "timeout"
            ? "timeout"
            : e instanceof Error
              ? e.message
              : String(e);
      }

      if (cancelled) return;

      if (exchangeError) {
        const isTimeout = exchangeError === "timeout";
        const msg = encodeURIComponent(
          isTimeout
            ? "Tiempo agotado. Abre el enlace en el navegador completo (Chrome/Safari), no dentro de Gmail. " +
                "Para correos, usa token_hash → /auth/verify (ver README)."
            : exchangeError
        );
        window.location.assign(
          `/auth/confirmed?status=error&message=${msg}&next=${encodeURIComponent(safeNext)}&from=callback${flowQs}`
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
        Si tarda mucho, abre el enlace en el navegador (no dentro de Gmail).
      </p>
      {hint ? <p className="text-red-600">{hint}</p> : null}
    </div>
  );
}
