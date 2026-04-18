"use client";

import { useState } from "react";
import TripCardItem from "@/components/dashboard/TripCardItem";

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
    <section className="space-y-4">
      <div className="flex flex-col gap-3 rounded-[24px] border border-slate-200/80 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-5">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold tracking-tight text-slate-950 sm:text-xl">{title}</h2>
          <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>
          <p className="mt-2 text-sm font-semibold text-slate-800">{countLabel}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-100"
          aria-expanded={open}
        >
          {open ? "Ocultar viajes" : "Mostrar viajes"}
        </button>
      </div>

      {open ? (
        trips.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-10 text-center text-sm text-slate-500">
            No hay viajes en esta categoría.
          </div>
        ) : (
          <div className="rounded-[28px] border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/90 p-5 shadow-sm sm:p-7 md:p-8">
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
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
