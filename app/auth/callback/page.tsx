import { Suspense } from "react";
import AuthShell from "@/components/auth/AuthShell";
import AuthCallbackClient from "@/components/auth/AuthCallbackClient";

export default function AuthCallbackPage() {
  return (
    <AuthShell
      title="Validando tu cuenta"
      subtitle="Estamos comprobando el enlace de confirmación."
    >
      <Suspense
        fallback={
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            Cargando…
          </div>
        }
      >
        <AuthCallbackClient />
      </Suspense>
    </AuthShell>
  );
}
