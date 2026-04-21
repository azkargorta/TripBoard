"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log útil para diagnosticar la causa real (mirar consola del navegador).
    console.error("Global error boundary:", error);
  }, [error]);

  return (
    <html lang="es">
      <body className="min-h-screen bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-slate-100">
        <main className="mx-auto flex min-h-screen max-w-[820px] flex-col items-center justify-center px-6 py-16 text-center">
          <div className="w-full rounded-3xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/50">
            <div className="text-sm font-extrabold uppercase tracking-[0.12em] text-violet-700 dark:text-violet-300">
              Algo ha fallado
            </div>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight">
              Se produjo un error al cargar esta pantalla
            </h1>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
              Puedes reintentar sin recargar toda la página. Si sigue ocurriendo, prueba a recargar.
            </p>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={() => reset()}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-300/60"
              >
                Reintentar
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-300/60 dark:border-slate-700/60 dark:bg-slate-950/40 dark:text-slate-100 dark:hover:bg-slate-900/40"
              >
                Recargar página
              </button>
            </div>

            <details className="mt-6 text-left">
              <summary className="cursor-pointer text-xs font-semibold text-slate-600 dark:text-slate-300">
                Ver detalles técnicos
              </summary>
              <pre className="mt-3 max-h-[240px] overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-4 text-[11px] leading-relaxed text-slate-700 dark:border-slate-700/60 dark:bg-slate-950/40 dark:text-slate-200">
{String(error?.stack || error?.message || error)}
              </pre>
              {error?.digest ? (
                <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">digest: {error.digest}</div>
              ) : null}
            </details>
          </div>
        </main>
      </body>
    </html>
  );
}

