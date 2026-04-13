"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Trip = {
  id: string;
  name: string;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "Sin fecha";
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatRange(start: string | null, end: string | null) {
  if (!start && !end) return "Fechas por definir";
  if (start && end) return `${formatDate(start)} — ${formatDate(end)}`;
  return start ? `Desde ${formatDate(start)}` : `Hasta ${formatDate(end)}`;
}

export default function TripCardItem({
  trip,
  badge,
  accent,
  locked,
}: {
  trip: Trip;
  badge: string;
  accent: string;
  locked: boolean;
}) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    setError(null);
    const ok = window.confirm(
      `¿Eliminar viaje "${trip.name}"?\n\nEsta acción no se puede deshacer.`
    );
    if (!ok) return;

    setDeleting(true);
    try {
      const resp = await fetch(`/api/trips/${encodeURIComponent(trip.id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const payload = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(payload?.error || `Error ${resp.status}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo eliminar el viaje.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className={`rounded-3xl border bg-gradient-to-br p-5 ${accent} ${locked ? "opacity-80" : ""}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="inline-flex items-center rounded-full bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700">
            {badge}
          </div>
          <div>
            <h3 className="text-2xl font-bold tracking-tight text-slate-950">{trip.name}</h3>
            <p className="mt-1 text-sm text-slate-600">{trip.destination || "Destino pendiente"}</p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="rounded-full bg-white/75 px-3 py-1 text-xs font-semibold text-slate-700">
            {locked ? "Premium" : "Entrar"}
          </div>
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="rounded-full border border-rose-200 bg-white px-3 py-1 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-60"
            title="Eliminar viaje"
          >
            {deleting ? "Eliminando…" : "Eliminar viaje"}
          </button>
        </div>
      </div>

      <div className="mt-5 rounded-2xl bg-white/75 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Fechas</p>
        <p className="mt-2 text-sm font-semibold text-slate-900">{formatRange(trip.start_date, trip.end_date)}</p>
      </div>

      {error ? (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
          {error}
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
        <span>{trip.destination || "Viaje"}</span>
        {locked ? (
          <span className="text-xs font-semibold text-amber-950">
            Viaje guardado. Hazte Premium para acceder.
          </span>
        ) : (
          <Link
            href={`/trip/${trip.id}`}
            className="inline-flex items-center gap-2 font-semibold text-slate-700 transition hover:text-slate-900"
          >
            Entrar <span aria-hidden>→</span>
          </Link>
        )}
      </div>
    </div>
  );
}

