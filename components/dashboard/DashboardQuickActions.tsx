"use client";

import Link from "next/link";

const PREMIUM_ANCHOR = "/account?upgrade=premium&focus=premium#premium-plans";

/**
 * Atajos visibles hacia IA sin quitar el resto del dashboard (principio: mostrar en el momento adecuado).
 */
export default function DashboardQuickActions({
  isPremium,
  recentTripId,
}: {
  isPremium: boolean;
  recentTripId: string | null;
}) {
  const chatBase = recentTripId ? `/trip/${encodeURIComponent(recentTripId)}/ai-chat` : null;

  return (
    <section className="rounded-3xl border border-violet-200/60 bg-gradient-to-br from-violet-50 via-white to-sky-50 p-6 shadow-sm md:p-8">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-violet-800">Tu diferencial</p>
          <h2 className="mt-1 text-xl font-bold text-slate-950 md:text-2xl">IA del viaje, a un toque</h2>
          <p className="mt-1 max-w-xl text-sm text-slate-600">
            Crear viaje sigue abajo. Si ya tienes uno, entra al chat para optimizar rutas o pedir planes sin perder el contexto del viaje.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <a
          href="#create-trip"
          className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-center text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 sm:min-w-[200px] sm:flex-none"
        >
          Crear viaje
        </a>

        {isPremium ? (
          <a
            href="#create-trip"
            className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-2xl border-2 border-violet-300 bg-white px-5 py-3 text-center text-sm font-semibold text-violet-950 shadow-sm transition hover:bg-violet-50 sm:min-w-[200px] sm:flex-none"
            title="Al guardar el viaje te llevamos al asistente IA"
          >
            Crear viaje con IA
          </a>
        ) : (
          <Link
            href={PREMIUM_ANCHOR}
            className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-2xl border-2 border-amber-200 bg-amber-50 px-5 py-3 text-center text-sm font-semibold text-amber-950 transition hover:bg-amber-100 sm:min-w-[200px] sm:flex-none"
          >
            Crear con IA (Premium)
          </Link>
        )}

        {isPremium && chatBase ? (
          <>
            <Link
              href={chatBase}
              className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-center text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 sm:min-w-[160px] sm:flex-none"
            >
              Optimizar ruta
            </Link>
            <Link
              href={chatBase}
              className="inline-flex min-h-[48px] flex-1 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-center text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 sm:min-w-[160px] sm:flex-none"
            >
              Sugerir planes
            </Link>
          </>
        ) : isPremium && !chatBase ? (
          <p className="w-full text-sm text-slate-600 sm:self-center">
            Crea un viaje y aquí aparecerán atajos al chat de tu último viaje.
          </p>
        ) : null}
      </div>
    </section>
  );
}
