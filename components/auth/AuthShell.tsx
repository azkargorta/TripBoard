import type { ReactNode } from "react";
import Image from "next/image";

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
    <main className="min-h-screen bg-gradient-to-br from-slate-100 via-slate-50 to-violet-100">
      <div className="mx-auto flex min-h-screen max-w-7xl items-start justify-center px-4 py-8 md:px-6 md:py-10">
        <div className="grid w-full max-w-6xl overflow-hidden rounded-[32px] border border-slate-200 bg-white/80 shadow-2xl backdrop-blur md:grid-cols-[1.05fr_0.95fr]">

          <section className="relative hidden overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-violet-900 p-10 text-white md:flex md:flex-col md:justify-between">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.14),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(168,85,247,0.22),transparent_30%)]" />

            <div className="relative z-10">
              <div className="flex items-center gap-4">
                <div className="overflow-hidden rounded-3xl bg-white p-2 shadow-lg">
                  <Image
                    src="/logo.png"
                    alt="TripBoard logo"
                    width={88}
                    height={88}
                    className="h-20 w-20 object-contain"
                    priority
                  />
                </div>

                <div>
                  <p className="text-3xl font-extrabold tracking-tight">TripBoard</p>
                  <p className="text-sm text-white/70">
                    Organiza tus viajes en un solo lugar
                  </p>
                </div>
              </div>

              <div className="mt-12 max-w-md">
                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white/80">
                  <span>Acceso</span>
                  <span>•</span>
                  <span>Travel Dashboard</span>
                </div>

                <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight">
                  Entra en tu espacio de viajes con una experiencia más visual y cuidada.
                </h1>

                <p className="mt-4 text-base leading-7 text-white/75">
                  Gestiona itinerarios, gastos, mapa, recursos, OCR y chat desde tu panel de TripBoard.
                </p>
              </div>
            </div>
          </section>

          <section className="flex items-start justify-center p-5 sm:p-8 md:p-10">
            <div className="w-full max-w-xl">
              <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
                <div className="mb-8 text-center">
                  <h3 className="text-4xl font-extrabold tracking-tight text-slate-950">
                    {title}
                  </h3>
                  {subtitle ? (
                    <p className="mt-3 text-base text-slate-600">{subtitle}</p>
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
