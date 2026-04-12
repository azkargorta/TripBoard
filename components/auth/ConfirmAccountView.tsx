"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLayoutEffect, useState } from "react";
import { isRecentGoogleOAuthAttempt } from "@/lib/google-oauth-attempt";

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

  const [oauthAttemptUi, setOauthAttemptUi] = useState(false);
  useLayoutEffect(() => {
    setOauthAttemptUi(isRecentGoogleOAuthAttempt());
  }, []);

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
    const fromCallback = searchParams.get("from") === "callback";
    const isGoogleOAuth =
      searchParams.get("flow") === "oauth" ||
      (fromCallback &&
        (oauthAttemptUi ||
          /invalid_grant|oauth|google|provider/i.test(raw)));
    const isFlowIssue =
      fromCallback ||
      /pkce|code verifier|flow state|invalid_grant|token has expired|verifier not found/i.test(raw);

    const description =
      isGoogleOAuth && fromCallback
        ? "Has vuelto desde Google, pero no se pudo cerrar el inicio de sesión (cookies PKCE o pestaña distinta). Prueba: ventana de incógnito, entra en la web, pulsa solo «Continuar con Google» y completa el flujo sin abrir otro sitio entremedio. Desactiva bloqueadores de cookies para tu dominio."
        : isFlowIssue
          ? "Al abrir el enlace dentro de Gmail (o en otro navegador distinto al que usaste al registrarte), la validación suele fallar. Prueba: menú del enlace → «Abrir en Chrome» / «Abrir en Safari» y vuelve a pulsar. Si el enlace ya caducó, pide un correo nuevo."
          : raw;

    return (
      <div className="space-y-5">
        <Card tone="error" title="No se pudo confirmar" description={description} />
        {isFlowIssue && isGoogleOAuth ? (
          <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-950">
            <p className="font-semibold">Esto no es un fallo del correo: es el retorno de Google (OAuth).</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Supabase</strong> → Authentication → URL Configuration: añade{" "}
                <code className="break-all rounded bg-amber-100/80 px-1 text-[11px] font-mono">
                  /auth/callback
                </code>{" "}
                en Redirect URLs (Google vuelve ahí). Opcional en Supabase: patrón{" "}
                <code className="break-all text-[11px]">https://tu-dominio/**</code>.
              </li>
              <li>
                <strong>Google Cloud</strong> → Credenciales OAuth → «URI de redireccionamiento» debe incluir{" "}
                <code className="break-all rounded bg-amber-100/80 px-1 text-[11px]">
                  https://TU-PROYECTO.supabase.co/auth/v1/callback
                </code>
              </li>
              <li>
                <strong>Supabase</strong> → Authentication → Providers → Google: activado, Client ID y Secret correctos.
              </li>
            </ul>
          </div>
        ) : null}
        {isFlowIssue && !isGoogleOAuth ? (
          <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-950">
            <p>
              <span className="font-semibold">Si el fallo viene de un enlace por correo:</span> no uses solo{" "}
              <code className="rounded bg-amber-100/80 px-1 font-mono">{"{{ .ConfirmationURL }}"}</code> (genera{" "}
              <code className="rounded bg-amber-100/80 px-1 font-mono">?code=</code>
              ). Usa en cada plantilla:
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Confirm signup:</strong>{" "}
                <code className="break-all rounded bg-amber-100/80 px-1 text-[11px]">
                  {"{{ .SiteURL }}/auth/verify?token_hash={{ .TokenHash }}&type=signup"}
                </code>
              </li>
              <li>
                <strong>Reset password:</strong>{" "}
                <code className="break-all rounded bg-amber-100/80 px-1 text-[11px]">
                  {"{{ .SiteURL }}/auth/verify?token_hash={{ .TokenHash }}&type=recovery"}
                </code>
              </li>
            </ul>
            <p>
              Redirect URLs debe incluir <code className="font-mono">/auth/verify</code>.
            </p>
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/auth/login"
            className="inline-flex min-h-[44px] items-center justify-center rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Ir al login
          </Link>
          <Link
            href={isGoogleOAuth ? "/auth/login" : isFlowIssue ? "/auth/forgot-password" : "/auth/register"}
            className="inline-flex min-h-[44px] items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            {isGoogleOAuth ? "Reintentar (volver al login)" : isFlowIssue ? "Pedir nuevo enlace (email)" : "Crear cuenta otra vez"}
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

