import Link from "next/link";
import TripBoardPremiumHero from "@/components/layout/TripBoardPremiumHero";
import { Check } from "lucide-react";

export const metadata = {
  title: "Precios · Kaviro",
  description:
    "Planes y precios de Kaviro: gratis para organizar viajes, Premium para el asistente personal y funciones avanzadas.",
};

const FREE_FEATURES = [
  "Plan del viaje",
  "Rutas, mapa y previsualización",
  "Autocompletar de lugares y coordenadas",
  "Gastos, balances y export CSV",
  "Participantes y permisos",
  "Reservas y recursos (manual)",
  "Compartir viaje (enlace)",
];

const PREMIUM_FEATURES = [
  "Asistente personal del viaje",
  "Análisis de tickets/documentos (PDF/imagen)",
  "Funciones avanzadas y mejoras continuas",
  "Soporte prioritario (cuando esté disponible)",
];

function FeatureList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((t) => (
        <li key={t} className="flex items-start gap-2 text-sm text-slate-700">
          <Check className="mt-0.5 h-4 w-4 text-emerald-600" aria-hidden />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

export default function PricingPage() {
  return (
    <main className="page-shell space-y-8 pb-14">
      <TripBoardPremiumHero
        eyebrow="Precios"
        title="Elige el plan que encaje con tu viaje"
        description="En el plan gratuito ya tienes mapa, rutas y autocompletar. Premium desbloquea el asistente personal y el análisis de documentos."
        actions={
          <>
            <Link
              href="/auth/login?next=/account?upgrade=premium&focus=premium#premium-plans"
              className="inline-flex min-h-[44px] items-center justify-center rounded-2xl bg-white px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
            >
              Hazte Premium
            </Link>
            <Link
              href="/auth/login"
              className="inline-flex min-h-[44px] items-center justify-center rounded-2xl border border-white/20 bg-white/10 px-5 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
            >
              Entrar
            </Link>
          </>
        }
      />

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="card-soft p-6 md:p-8">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Plan</p>
              <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950">Gratis</h2>
              <p className="mt-2 text-sm text-slate-600">
                Todo lo esencial para organizar el viaje en grupo.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900">
              0€ / mes
            </div>
          </div>

          <div className="mt-6">
            <FeatureList items={FREE_FEATURES} />
          </div>
        </div>

        <div className="card-soft p-6 md:p-8">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Plan</p>
              <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950">Premium</h2>
              <p className="mt-2 text-sm text-slate-600">
                Para automatizar y ahorrar tiempo con el asistente personal.
              </p>
            </div>
            <div className="space-y-1 text-right">
              <div className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
                3,99€ / mes
              </div>
              <div className="text-xs font-semibold text-slate-600">o 39,99€ / año</div>
            </div>
          </div>

          <div className="mt-6">
            <FeatureList items={PREMIUM_FEATURES} />
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/auth/login?next=/account?upgrade=premium&focus=premium#premium-plans"
              className="inline-flex min-h-[44px] items-center justify-center rounded-2xl bg-slate-950 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Empezar Premium
            </Link>
            <Link
              href="/account"
              className="inline-flex min-h-[44px] items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
            >
              Ver cuenta
            </Link>
          </div>
        </div>
      </section>

      <section className="card-soft p-6 md:p-8">
        <h3 className="text-lg font-bold text-slate-950">Preguntas frecuentes</h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-slate-950">¿Las rutas y el autocompletar están incluidos en Gratis?</p>
            <p className="mt-1 text-sm text-slate-600">
              Sí. El plan gratuito incluye mapa con rutas, trayectos y autocompletar para guardar coordenadas.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-slate-950">¿Qué desbloquea Premium entonces?</p>
            <p className="mt-1 text-sm text-slate-600">
              Principalmente el asistente personal (conversación con contexto del viaje) y el análisis de documentos (tickets, PDFs e imágenes) para ahorrar tiempo.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

