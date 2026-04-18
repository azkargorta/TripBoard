"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import TripDashboardEditDialog from "@/components/dashboard/TripDashboardEditDialog";

type Trip = {
  id: string;
  name: string;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  base_currency: string | null;
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
  const toast = useToast();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

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
      toast.success("Viaje eliminado", `Se eliminó "${trip.name}".`);
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo eliminar el viaje.";
      setError(msg);
      toast.error("No se pudo eliminar", msg);
    } finally {
      setDeleting(false);
    }
  }

  function openTrip() {
    if (locked) return;
    router.push(`/trip/${encodeURIComponent(trip.id)}`);
  }

  return (
    <div
      role={locked ? undefined : "link"}
      tabIndex={locked ? -1 : 0}
      onClick={openTrip}
      onKeyDown={(e) => {
        if (locked) return;
        if (e.key === "Enter" || e.key === " ") openTrip();
      }}
      className={`rounded-3xl border bg-gradient-to-br p-5 shadow-sm ${accent} ${
        locked ? "opacity-80" : "cursor-pointer transition hover:-translate-y-0.5 hover:shadow-md"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="inline-flex items-center rounded-full bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700">
            {badge}
          </div>
          <div>
            <h3 className="text-2xl font-bold tracking-tight text-slate-950">{trip.name}</h3>
            <p className="mt-1 flex items-start gap-1.5 text-sm text-slate-600">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
              <span>{trip.destination || "Destino pendiente"}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          {locked ? (
            <div className="rounded-full bg-white/75 px-3 py-1 text-xs font-semibold text-slate-700">
              Premium
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-5 rounded-2xl bg-white/75 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Fechas y moneda</p>
        <p className="mt-2 text-sm font-semibold text-slate-900">{formatRange(trip.start_date, trip.end_date)}</p>
        <p className="mt-1 text-xs text-slate-600">
          Moneda base: <span className="font-semibold">{(trip.base_currency || "EUR").toUpperCase()}</span>
        </p>
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
            Funciones premium bloqueadas. Hazte Premium para desbloquear.
          </span>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setEditOpen(true);
          }}
          className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-50"
          title="Editar destino, fechas y moneda"
        >
          <Pencil className="h-4 w-4" aria-hidden />
          Editar
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void onDelete();
          }}
          disabled={deleting}
          className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-white px-4 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-60"
          title="Eliminar viaje"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
          {deleting ? "Eliminando…" : "Eliminar viaje"}
        </button>
      </div>

      <TripDashboardEditDialog
        trip={editOpen ? trip : null}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={() => router.refresh()}
      />
    </div>
  );
}

