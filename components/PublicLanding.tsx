"use client";

import Link from "next/link";
import { useEffect } from "react";
import TripBoardLogo from "@/components/brand/TripBoardLogo";
import { ArrowRight, CalendarDays, Check, MapPinned, Sparkles, Wallet } from "lucide-react";
import { PremiumBadge } from "@/components/layout/PremiumBadge";
import DarkModeToggle from "@/components/ui/DarkModeToggle";

function Feature({ children }: { children: string }) {
  return (
    <li className="flex items-start gap-2 text-sm text-slate-700">
      <Check className="mt-0.5 h-4 w-4 text-emerald-600" aria-hidden />
      <span>{children}</span>
    </li>
  );
}

/**
 * Landing pública.
 *
 * Importante: mantenemos el “escape hatch” para enlaces de Supabase con tokens
 * en el hash (#) o con `code` en query para recovery/OAuth.
 */
export default function PublicLanding() {
  useEffect(() => {
    const { hash, search } = window.location;
    const code = new URLSearchParams(search).get("code");

    if (code) {
      const q = new URLSearchParams({
        code,
        next: "/auth/reset-password",
        type: "recovery",
      });
      window.location.replace(`/auth/callback?${q.toString()}`);
      return;
    }

    if (hash && (hash.includes("type=recovery") || hash.includes("access_token"))) {
      window.location.replace(`/auth/reset-password${hash}`);
      return;
    }
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-b from-cyan-50/80 via-slate-50 to-violet-100/60">
      <header className="absolute left-0 right-0 top-0 z-50">
        <div className="page-shell flex items-center justify-between py-3 sm:py-4">
          <TripBoardLogo href="/" variant="dark" size="lg" withWordmark imageClassName="drop-shadow-none" />
          <nav className="flex items-center gap-2">
            <Link
              href="/pricing"
              className="inline-flex min-h-10 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
            >
              Precios
            </Link>
            <Link
              href="/auth/login"
              className="inline-flex min-h-10 items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
            >
              Entrar
            </Link>
            <div className="flex items-center gap-2">
              <Link
                href="/auth/register"
                className="inline-flex min-h-10 items-center justify-center rounded-full bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Crear cuenta
              </Link>
              <PremiumBadge />
            </div>
            <DarkModeToggle />
          </nav>
        </div>
      </header>

      <section className="page-shell pb-8 pt-20 sm:pb-10 sm:pt-24 md:pb-12 md:pt-28">
        <div className="relative overflow-hidden rounded-[1.5rem] border border-cyan-200/50 bg-gradient-to-br from-white via-cyan-50/50 to-violet-100/70 p-5 shadow-lg shadow-cyan-900/5 sm:rounded-[2rem] sm:p-7 md:rounded-[2.25rem] md:p-9 lg:p-10">
          <div
            className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-cyan-400/25 blur-3xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -bottom-20 -left-16 h-56 w-56 rounded-full bg-violet-400/20 blur-3xl"
            aria-hidden
          />

          <div className="relative grid gap-6 sm:gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-start">
            <div className="space-y-4 sm:space-y-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
                <div className="inline-flex w-fit items-center gap-2 rounded-full border border-cyan-300/60 bg-cyan-100/80 px-3 py-1.5 text-xs font-semibold text-cyan-950">
                  <Sparkles className="h-3.5 w-3.5 text-cyan-700" aria-hidden />
                  Menos caos, más viaje
                </div>
              </div>

              <h1 className="text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl md:text-[2.65rem] md:leading-tight">
                Organiza todo tu viaje en un solo lugar
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-slate-700 sm:text-base md:text-lg">
                Itinerario, gastos, rutas y planes sin caos. Gratis: mapa, plan por días y reparto de gastos. Premium:
                asistente personal, documentos y automatización.
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/auth/register"
                  className="inline-flex min-h-[48px] items-center justify-center rounded-2xl bg-gradient-to-r from-cyan-600 to-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-cyan-600/25 transition hover:from-cyan-500 hover:to-violet-500"
                >
                  Crear viaje
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                </Link>
                <span className="text-sm text-slate-600">
                  <Link href="/pricing" className="font-semibold text-violet-800 underline-offset-2 hover:underline">
                    Ver precios y planes
                  </Link>
                </span>
              </div>

              <div className="rounded-2xl border border-violet-200/60 bg-gradient-to-br from-white to-violet-50/90 p-4 shadow-sm md:p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-800/90">Qué incluye</p>
                <ul className="mt-3 grid gap-2 text-sm text-slate-800 sm:grid-cols-2">
                  <Feature>Plan por días con horas</Feature>
                  <Feature>Rutas entre paradas sobre el mapa</Feature>
                  <Feature>Gastos y balances del grupo</Feature>
                  <Feature>Premium: asistente personal y OCR de reservas</Feature>
                </ul>
                <p className="mt-3 text-center text-xs text-slate-600">
                  <Link href="/pricing" className="font-semibold text-cyan-800 hover:underline">
                    Comparar planes
                  </Link>
                </p>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-gradient-to-br from-slate-900 via-cyan-900 to-violet-950 p-6 text-white shadow-xl md:p-8">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-cyan-500/20 via-transparent to-transparent" aria-hidden />
                <div className="relative space-y-6">
                  <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4" />
                  <p className="text-sm font-medium leading-relaxed text-cyan-50/95">
                    Todo lo esencial del viaje en un panel: agenda, rutas, gastos y asistente cuando tengas Premium.
                  </p>
                  <ul className="space-y-3">
                    {[
                      { label: "Plan e itinerario", sub: "Por días y horas", icon: CalendarDays, tone: "from-sky-400 to-cyan-300" },
                      { label: "Rutas", sub: "Paradas enlazadas", icon: MapPinned, tone: "from-emerald-400 to-teal-300" },
                      { label: "Gastos del grupo", sub: "Balances claros", icon: Wallet, tone: "from-amber-400 to-orange-300" },
                      { label: "Asistente personal", sub: "Premium", icon: Sparkles, tone: "from-violet-400 to-fuchsia-300" },
                    ].map((row) => {
                      const RowIcon = row.icon;
                      return (
                      <li
                        key={row.label}
                        className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-3 backdrop-blur-sm"
                      >
                        <span
                          className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${row.tone} text-slate-900 shadow-inner`}
                        >
                          <RowIcon className="h-5 w-5" aria-hidden />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-white">{row.label}</p>
                          <p className="text-xs text-cyan-100/80">{row.sub}</p>
                        </div>
                      </li>
                    );
                    })}
                  </ul>
                </div>
              </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-violet-200/40 bg-gradient-to-r from-slate-100/90 via-white to-cyan-50/80">
        <div className="page-shell flex flex-col gap-3 py-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-slate-600">
            <span className="font-semibold text-slate-900">Kaviro</span> · Organiza viajes, gastos y rutas
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href="/pricing" className="font-semibold text-slate-700 hover:underline">
              Precios
            </Link>
            <Link href="/auth/login" className="font-semibold text-slate-700 hover:underline">
              Entrar
            </Link>
            <Link href="/auth/register" className="font-semibold text-slate-700 hover:underline">
              Crear cuenta
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

