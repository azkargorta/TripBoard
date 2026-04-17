"use client";

import Link from "next/link";
import { useEffect } from "react";
import TripBoardLogo from "@/components/brand/TripBoardLogo";
import TripHeroMock from "@/components/landing/TripHeroMock";
import { ArrowRight, Check, Sparkles } from "lucide-react";

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
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200/70 bg-white/75 backdrop-blur supports-[backdrop-filter]:bg-white/60">
        <div className="page-shell flex items-center justify-between py-4">
          <TripBoardLogo href="/" variant="dark" size="md" withWordmark />
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
            <Link
              href="/auth/register"
              className="inline-flex min-h-10 items-center justify-center rounded-full bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Crear cuenta
            </Link>
          </nav>
        </div>
      </header>

      <section className="page-shell space-y-10 py-10 md:space-y-14 md:py-14">
        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
              <Sparkles className="h-3.5 w-3.5 text-cyan-700" aria-hidden />
              Menos caos, más viaje
            </div>

            <h1 className="text-4xl font-extrabold tracking-tight text-slate-950 md:text-5xl">
              Organiza todo tu viaje en un solo lugar
            </h1>
            <p className="max-w-2xl text-base leading-relaxed text-slate-600 md:text-lg">
              Itinerario, gastos, rutas y planes sin caos. Gratis: mapa, plan por días y reparto de gastos. Premium: IA,
              documentos y automatización.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/auth/register"
                className="inline-flex min-h-[48px] items-center justify-center rounded-2xl bg-slate-950 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
              >
                Crear viaje
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex min-h-[48px] items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
              >
                Ver precios
              </Link>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 md:p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Qué incluye</p>
              <ul className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                <Feature>Plan por días con horas</Feature>
                <Feature>Mapa y rutas entre paradas</Feature>
                <Feature>Gastos y balances del grupo</Feature>
                <Feature>Premium: chat IA y OCR de reservas</Feature>
              </ul>
              <p className="mt-3 text-center text-xs text-slate-500">
                <Link href="/pricing" className="font-semibold text-cyan-800 hover:underline">
                  Comparar planes
                </Link>
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <TripHeroMock />
            <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">En 2 minutos</p>
              <p className="mt-2 text-lg font-extrabold tracking-tight text-slate-950">Crea, invita, rellena</p>
              <ol className="mt-4 list-decimal space-y-2 pl-4 text-sm text-slate-600">
                <li>Crea el viaje (nombre obligatorio).</li>
                <li>Invita por enlace.</li>
                <li>Plan, mapa y gastos en el mismo sitio.</li>
              </ol>
              <Link
                href="/auth/register"
                className="mt-5 inline-flex w-full min-h-[48px] items-center justify-center rounded-2xl bg-cyan-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-cyan-800"
              >
                Crear cuenta
              </Link>
              <p className="mt-2 text-center text-xs text-slate-500">
                ¿Ya tienes cuenta?{" "}
                <Link href="/auth/login" className="font-semibold text-slate-700 hover:underline">
                  Entrar
                </Link>
              </p>
            </aside>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200/70 bg-white">
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

