"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { clearGoogleOAuthReturn } from "@/lib/google-oauth-marker";
import { createClient } from "@/lib/supabase/client";
import { withTimeout } from "@/lib/with-timeout";

type AuthCallbackClientProps = {
  /** Ruta dedicada OAuth: Supabase suele borrar query params del redirectTo; así /auth/confirmed sabe que es Google. */
  forcedFlow?: "oauth";
};

/**
 * Canjea ?code= en el cliente con el mismo almacén PKCE que usó signInWithOAuth.
 * El canje solo en servidor falla si el verificador no llega igual a la API; además,
 * con detectSessionInUrl desactivado evitamos doble canje contra el layout.
 */
export default function AuthCallbackClient({ forcedFlow }: AuthCallbackClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    if (forcedFlow !== "oauth") {
      clearGoogleOAuthReturn();
    }

    const oauthError = searchParams.get("error");
    const oauthDesc = searchParams.get("error_description");
    const code = searchParams.get("code");
    const next = searchParams.get("next") ?? "/dashboard";
    const type = (searchParams.get("type") || "").toLowerCase();
    const flow = forcedFlow || searchParams.get("flow") || "";

    const flowQs = flow ? `&flow=${encodeURIComponent(flow)}` : "";
    const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

    if (oauthError || oauthDesc) {
      const raw = oauthDesc || oauthError || "";
      let text = raw;
      try {
        text = decodeURIComponent(raw.replace(/\+/g, " "));
      } catch {
        /* ya plano o % inválido */
      }
      const msg = encodeURIComponent(
        text || "Inicio de sesión cancelado o denegado. Vuelve a intentar con Google."
      );
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
        message: "Falta el código de validación.",
        next: safeNext,
      });
      q.set("from", "callback");
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
            ? flow === "oauth"
              ? "Tiempo agotado al cerrar el inicio con Google. Prueba en una ventana de incógnito y sin bloqueadores de cookies."
              : "Tiempo agotado al validar. Abre el enlace en el navegador completo (Chrome/Safari), no dentro de Gmail. " +
                  "Para correos, usa enlaces con token_hash → /auth/verify (ver README)."
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

      if (forcedFlow === "oauth") {
        clearGoogleOAuthReturn();
        window.location.assign(safeNext);
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
  }, [router, searchParams, forcedFlow]);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center text-sm text-slate-600">
      <p>{forcedFlow === "oauth" ? "Completando inicio de sesión con Google…" : "Validando enlace…"}</p>
      <p className="max-w-sm text-xs text-slate-500">
        {forcedFlow === "oauth"
          ? "No cierres esta pestaña hasta que termine la redirección."
          : "Si tarda mucho, pulsa los tres puntos del enlace en Gmail y elige «Abrir en el navegador»."}
      </p>
      {hint ? <p className="text-red-600">{hint}</p> : null}
    </div>
  );
}
