import type { ReactNode } from "react";
import Link from "next/link";
import TripBoardLogo from "@/components/brand/TripBoardLogo";

type AuthShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

export default function AuthShell({
  title,
  subtitle,
  children,
}: AuthShellProps) {
  return (
    <main className="min-h-dvh min-w-0 bg-gradient-to-br from-slate-100 via-slate-50 to-cyan-100">
      <div className="mx-auto flex min-h-dvh max-w-7xl items-start justify-center py-6 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:py-8 sm:pl-6 sm:pr-6 md:py-10">
        <div className="grid w-full max-w-6xl overflow-hidden rounded-3xl border border-slate-200 bg-white/80 shadow-2xl backdrop-blur sm:rounded-[28px] md:grid-cols-[1.05fr_0.95fr] md:rounded-[32px]">

          <section className="relative hidden overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-900 p-10 text-white md:flex md:flex-col md:justify-between">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.14),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(34,211,238,0.22),transparent_30%)]" />

            <div className="relative z-10">
              <div className="max-w-md">
                <TripBoardLogo variant="light" size="lg" withWordmark imageClassName="scale-[1.04] origin-left" />
                <p className="mt-3 text-sm text-white/70">Organiza tus viajes en un solo lugar</p>
              </div>

              <div className="mt-12 max-w-md">
                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white/80">
                  <span>Acceso</span>
                  <span>•</span>
                  <span>Travel Dashboard</span>
                </div>

                <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight">
                  Organiza y disfruta de tu viaje gracias a tu planificador personal.
                </h1>

                <p className="mt-4 text-base leading-7 text-white/75">
                  Gestiona itinerarios, gastos, mapa, recursos, OCR y asistente personal desde tu panel de Kaviro.
                </p>
              </div>
            </div>
          </section>

          <section className="flex min-w-0 items-start justify-center p-4 sm:p-8 md:p-10">
            <div className="w-full min-w-0 max-w-xl">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xl sm:rounded-[28px] sm:p-8">
                <div className="mb-5 flex flex-wrap items-center justify-between gap-2 sm:mb-6 sm:gap-3">
                  <Link
                    href="/"
                    className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Volver a inicio
                  </Link>
                  <Link
                    href="/pricing"
                    className="inline-flex items-center justify-center rounded-full bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
                  >
                    Ver precios
                  </Link>
                </div>
                <div className="mb-6 text-center sm:mb-8">
                  <div className="mb-4 flex justify-center sm:mb-5">
                    <TripBoardLogo href="/" variant="dark" size="lg" withWordmark />
                  </div>
                  <h3 className="text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">
                    {title}
                  </h3>
                  {subtitle ? (
                    <p className="mt-2 text-sm text-slate-600 sm:mt-3 sm:text-base">{subtitle}</p>
                  ) : null}
                </div>

                {children}
              </div>
            </div>
          </section>

        </div>
      </div>
    </main>
  );
}
