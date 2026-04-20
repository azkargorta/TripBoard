"use client";

import { useState } from "react";
import TripCardItem from "@/components/dashboard/TripCardItem";
import { btnPrimary } from "@/components/ui/brandStyles";

type Trip = {
  id: string;
  name: string;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  base_currency: string | null;
};

export default function DashboardTripSection({
  title,
  subtitle,
  trips,
  badge,
  accent,
  lockedTripIds,
}: {
  title: string;
  subtitle: string;
  trips: Trip[];
  badge: string;
  accent: string;
  /** Lista serializable (p. ej. desde el servidor). */
  lockedTripIds: string[];
}) {
  const [open, setOpen] = useState(false);
  const count = trips.length;
  const countLabel = `${count} viaje${count === 1 ? "" : "s"}`;

  return (
    <section className="mx-auto max-w-2xl space-y-3">
      <div className="flex flex-col gap-2 rounded-2xl border border-slate-200/90 bg-white p-3 shadow-sm ring-1 ring-slate-900/[0.03] sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:p-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold tracking-tight text-slate-950 sm:text-lg">{title}</h2>
          <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">{subtitle}</p>
          <p className="mt-1 text-xs font-semibold text-slate-800 sm:text-sm">{countLabel}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`${btnPrimary} min-h-[40px] rounded-lg px-3 py-1.5 text-xs sm:text-sm`}
          aria-expanded={open}
        >
          {open ? "Ocultar viajes" : "Mostrar viajes"}
        </button>
      </div>

      {open ? (
        trips.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-6 text-center text-xs text-slate-500 sm:text-sm">
            No hay viajes en esta categoría.
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/90 p-3 shadow-sm ring-1 ring-slate-900/[0.03] sm:p-4">
            <div className="grid grid-cols-1 gap-3 sm:gap-4">
              {trips.map((trip) => (
                <TripCardItem
                  key={trip.id}
                  trip={trip}
                  badge={badge}
                  accent={accent}
                  locked={lockedTripIds.includes(String(trip.id))}
                />
              ))}
            </div>
          </div>
        )
      ) : null}
    </section>
  );
}
