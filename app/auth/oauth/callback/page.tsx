import { Suspense } from "react";
import AuthShell from "@/components/auth/AuthShell";
import AuthCallbackClient from "@/components/auth/AuthCallbackClient";

/**
 * Solo Google OAuth. Debe figurar en Supabase → Redirect URLs (además de /auth/callback si lo usas para correo).
 */
export default function GoogleOAuthCallbackPage() {
  return (
    <AuthShell
      title="Conectando con Google"
      subtitle="Estamos completando el inicio de sesión."
    >
      <Suspense
        fallback={
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            Cargando…
          </div>
        }
      >
        <AuthCallbackClient forcedFlow="oauth" />
      </Suspense>
    </AuthShell>
  );
}
