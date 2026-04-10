"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { withTimeout } from "@/lib/with-timeout";

/**
 * El intercambio PKCE debe hacerse en el cliente: el code_verifier se guarda
 * en cookies vía createBrowserClient; un Route Handler a veces no lo recibe y
 * devuelve "PKCE code verifier not found in storage".
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
      router.replace(`/auth/confirmed?${q.toString()}`);
      return;
    }

    const authCode = code;
    let cancelled = false;

    async function run() {
      const supabase = createClient();
      let exErr: { message: string } | null = null;
      try {
        const result = await withTimeout(
          supabase.auth.exchangeCodeForSession(authCode),
          22_000,
          "timeout"
        );
        exErr = result.error;
      } catch {
        exErr = {
          message:
            "Tiempo agotado al validar el enlace (flujo PKCE). En Supabase → Email templates → «Confirm signup», cambia el botón a: {{ .SiteURL }}/auth/verify?token_hash={{ .TokenHash }}&type=signup",
        };
      }

      if (cancelled) return;

      if (exErr) {
        // React Strict Mode puede ejecutar el efecto dos veces; el segundo exchange falla.
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          if (type === "recovery" || next.startsWith("/auth/reset-password")) {
            router.replace("/auth/reset-password");
            router.refresh();
            return;
          }
          const q = new URLSearchParams({ status: "ok", next });
          router.replace(`/auth/confirmed?${q.toString()}`);
          router.refresh();
          return;
        }

        const q = new URLSearchParams({
          status: "error",
          message: exErr.message,
          next,
        });
        router.replace(`/auth/confirmed?${q.toString()}`);
        return;
      }

      if (type === "recovery" || next.startsWith("/auth/reset-password")) {
        router.replace("/auth/reset-password");
        router.refresh();
        return;
      }

      const q = new URLSearchParams({ status: "ok", next });
      router.replace(`/auth/confirmed?${q.toString()}`);
      router.refresh();
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
      {hint ? <p className="text-red-600">{hint}</p> : null}
    </div>
  );
}
