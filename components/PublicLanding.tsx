"use client";

import Link from "next/link";
import { useEffect } from "react";
import TripBoardLogo from "@/components/brand/TripBoardLogo";
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

      <section className="page-shell py-10 md:py-14">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
              <Sparkles className="h-3.5 w-3.5 text-cyan-700" aria-hidden />
              Organiza viajes en grupo sin líos
            </div>

            <h1 className="text-4xl font-extrabold tracking-tight text-slate-950 md:text-5xl">
              Plan, mapa, rutas y gastos en un solo lugar
            </h1>
            <p className="max-w-2xl text-base leading-relaxed text-slate-600 md:text-lg">
              Kaviro te ayuda a coordinar el itinerario, dibujar rutas, guardar lugares con coordenadas y repartir gastos.
              El plan gratuito incluye mapa, rutas y autocompletar.
            </p>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/auth/register"
                className="inline-flex min-h-[44px] items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Empezar gratis
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex min-h-[44px] items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
              >
                Ver precios
              </Link>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-3xl border border-slate-200 bg-white p-5">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Gratis</div>
                <div className="mt-2 text-sm font-bold text-slate-950">Mapa, rutas y autocompletar incluidos</div>
                <ul className="mt-3 space-y-2">
                  <Feature>Crear plan por días con horas</Feature>
                  <Feature>Guardar lugares con coordenadas</Feature>
                  <Feature>Calcular rutas y previsualizar</Feature>
                  <Feature>Gastos y balances del grupo</Feature>
                </ul>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-5">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Premium</div>
                <div className="mt-2 text-sm font-bold text-slate-950">IA y análisis de documentos</div>
                <ul className="mt-3 space-y-2">
                  <Feature>Chat IA del viaje</Feature>
                  <Feature>Analizar tickets (PDF/imagen)</Feature>
                  <Feature>Automatizar tareas repetitivas</Feature>
                  <Feature>Funciones avanzadas</Feature>
                </ul>
                <div className="mt-4 rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
                  3,99€ / mes · 39,99€ / año
                </div>
              </div>
            </div>
          </div>

          <aside className="card-soft p-6 md:p-8">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">En 2 minutos</p>
                <p className="mt-2 text-xl font-extrabold tracking-tight text-slate-950">
                  Tu viaje listo para colaborar
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  Crea un viaje, invita a tu grupo y empieza a rellenar plan, mapa y gastos. Todo queda centralizado.
                </p>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {[
                ["1) Crea el viaje", "Nombre y destino (opcional)."],
                ["2) Invita a tu grupo", "Link por WhatsApp o email."],
                ["3) Añade plan y rutas", "Autocompletar + coordenadas + mapa."],
                ["4) Reparte gastos", "Balances y exportación."],
              ].map(([t, d]) => (
                <div key={t} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-sm font-semibold text-slate-950">{t}</p>
                  <p className="mt-1 text-sm text-slate-600">{d}</p>
                </div>
              ))}
            </div>

            <div className="mt-6">
              <Link
                href="/auth/register"
                className="inline-flex w-full min-h-[46px] items-center justify-center rounded-2xl bg-cyan-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-cyan-800"
              >
                Crear cuenta y empezar
              </Link>
              <p className="mt-2 text-center text-xs text-slate-500">
                ¿Ya tienes cuenta?{" "}
                <Link href="/auth/login" className="font-semibold text-slate-700 hover:underline">
                  Inicia sesión
                </Link>
              </p>
            </div>
          </aside>
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

