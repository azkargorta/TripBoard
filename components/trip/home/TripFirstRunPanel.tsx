"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Item = {
  title: string;
  description: string;
  href: string;
  pill: string;
};

export default function TripFirstRunPanel({
  tripId,
  tripName,
  canEditTrip,
  isPremium,
  counts,
}: {
  tripId: string;
  tripName: string;
  canEditTrip: boolean;
  /** Con Premium, la primera recomendación es el chat IA; sin Premium, otro orden guiado. */
  isPremium: boolean;
  counts: {
    participants: number;
    activities: number;
    routes: number;
    expenses: number;
    resources: number;
  };
}) {
  const storageKey = useMemo(() => `kaviro_trip_first_run_v1:${tripId}`, [tripId]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const seen = window.localStorage.getItem(storageKey) === "1";
      const looksNew =
        counts.participants <= 1 &&
        counts.activities === 0 &&
        counts.routes === 0 &&
        counts.expenses === 0 &&
        counts.resources === 0;

      if (!seen && looksNew) setOpen(true);
    } catch {
      /* */
    }
  }, [counts, storageKey]);

  function dismiss() {
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      /* */
    }
    setOpen(false);
  }

  if (!open) return null;

  const id = encodeURIComponent(tripId);

  const stepDestination: Item = {
    title: "Añade el destino y las fechas",
    description: "Activa clima y deja el viaje bien definido.",
    href: `/trip/${id}`,
    pill: canEditTrip ? "Recomendado" : "Opcional",
  };

  const stepParticipants: Item = {
    title: "Invita a tu grupo",
    description: "Participantes y permisos, todo desde aquí.",
    href: `/trip/${id}/participants`,
    pill: counts.participants > 1 ? "Listo" : "Siguiente",
  };

  const stepPlan: Item = {
    title: "Crea el plan",
    description: "Agenda, visitas y horarios por días.",
    href: `/trip/${id}/plan`,
    pill: counts.activities > 0 ? "Listo" : "Siguiente",
  };

  const stepMap: Item = {
    title: "Explora el mapa",
    description: "Rutas, trayectos y paradas.",
    href: `/trip/${id}/map`,
    pill: counts.routes > 0 ? "Listo" : "Siguiente",
  };

  const stepResources: Item = {
    title: "Sube recursos y reservas",
    description: "Reservas, tickets, documentos y listas.",
    href: `/trip/${id}/resources`,
    pill: counts.resources > 0 ? "Listo" : "Siguiente",
  };

  const stepExpenses: Item = {
    title: "Añade gastos",
    description: "Split, pagos y balances del grupo (lo habitual es dejarlo para cuando ya hay plan y grupo).",
    href: `/trip/${id}/expenses`,
    pill: counts.expenses > 0 ? "Listo" : "Siguiente",
  };

  const stepExpensesFreeLast: Item = {
    ...stepExpenses,
    pill: counts.expenses > 0 ? "Listo" : "Por último",
  };

  const stepAiChat: Item = {
    title: "Prepara el viaje con el chat IA",
    description:
      "Itinerarios, organizar un día completo, dudas y propuestas usando el contexto de este viaje.",
    href: `/trip/${id}/ai-chat`,
    pill: "Empieza aquí",
  };

  const items: Item[] = isPremium
    ? [stepAiChat, stepDestination, stepParticipants, stepPlan, stepMap, stepResources, stepExpenses]
    : [stepParticipants, stepPlan, stepMap, stepResources, stepExpensesFreeLast];

  return (
    <section className="card-soft overflow-hidden">
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-cyan-900 p-6 text-white">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">
              Primeros pasos del viaje
            </p>
            <h2 className="text-2xl font-extrabold tracking-tight">
              {tripName}: esto es lo que puedes hacer
            </h2>
            <p className="max-w-2xl text-sm text-white/75">
              Te dejamos un recorrido rápido para que sepas dónde está cada cosa. Puedes cerrarlo y seguir a tu ritmo.
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="inline-flex min-h-[40px] items-center justify-center rounded-2xl border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/15"
          >
            Entendido
          </button>
        </div>
      </div>

      <div className="grid gap-3 p-6 md:grid-cols-2">
        {items.map((it) => (
          <Link
            key={it.title}
            href={it.href}
            className="group rounded-2xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-slate-950">{it.title}</p>
                <p className="mt-1 text-sm text-slate-600">{it.description}</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-700">
                {it.pill}
              </span>
            </div>
            <div className="mt-3 text-sm font-semibold text-cyan-700 transition group-hover:translate-x-0.5">
              Abrir →
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

