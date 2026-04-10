"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

function Card({
  tone,
  title,
  description,
}: {
  tone: "ok" | "error" | "info";
  title: string;
  description: string;
}) {
  const styles =
    tone === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : tone === "error"
        ? "border-red-200 bg-red-50 text-red-800"
        : "border-slate-200 bg-slate-50 text-slate-700";
  return (
    <div className={`rounded-2xl border px-4 py-3 text-sm ${styles}`}>
      <div className="font-semibold">{title}</div>
      <div className="mt-1 text-sm opacity-90">{description}</div>
    </div>
  );
}

export default function ConfirmAccountView() {
  const searchParams = useSearchParams();
  const status = (searchParams.get("status") || "").toLowerCase();
  const next = searchParams.get("next") || "/dashboard";

  if (status === "ok") {
    return (
      <div className="space-y-5">
        <Card tone="ok" title="Cuenta confirmada" description="Tu email se ha validado correctamente. Ya puedes entrar." />
        <Link
          href={`/auth/login?next=${encodeURIComponent(next)}`}
          className="inline-flex w-full min-h-[44px] items-center justify-center rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
        >
          Iniciar sesión
        </Link>
      </div>
    );
  }

  if (status === "error") {
    const raw = searchParams.get("message") || "No se pudo validar el enlace. Puede haber caducado o ya estar usado.";
    const isPkce = /pkce|code verifier/i.test(raw);
    const description = isPkce
      ? "El enlace no encaja con este navegador o ya no es válido. Vuelve a pedir recuperación de contraseña desde “Olvidé mi contraseña” y usa solo el enlace del correo más reciente (con la app actualizada funciona aunque lo abras en otro dispositivo)."
      : raw;
    return (
      <div className="space-y-5">
        <Card tone="error" title="No se pudo confirmar" description={description} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href={isPkce ? "/auth/forgot-password" : "/auth/register"}
            className="inline-flex min-h-[44px] items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            {isPkce ? "Pedir nuevo enlace" : "Crear cuenta otra vez"}
          </Link>
          <Link
            href="/auth/login"
            className="inline-flex min-h-[44px] items-center justify-center rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Ir al login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Card tone="info" title="Abriendo enlace…" description="Si esta pantalla no cambia, vuelve a intentar abrir el enlace del email." />
      <Link
        href="/auth/login"
        className="inline-flex w-full min-h-[44px] items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
      >
        Ir al login
      </Link>
    </div>
  );
}

