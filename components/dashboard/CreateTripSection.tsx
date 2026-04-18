"use client";

import { useEffect, useState } from "react";
import CreateTripForm from "./CreateTripForm";
import Link from "next/link";

export default function CreateTripSection({
  isPremium,
  tripCount,
  startWithFormOpen = false,
}: {
  isPremium: boolean;
  tripCount: number;
  /** Si no hay viajes, abrimos el formulario al cargar (camino principal). */
  startWithFormOpen?: boolean;
}) {
  const [showForm, setShowForm] = useState(startWithFormOpen);
  const FREE_TRIP_LIMIT = 3;
  const locked = !isPremium && tripCount >= FREE_TRIP_LIMIT;

  useEffect(() => {
    const openFromHash = () => {
      try {
        if (window.location.hash === "#create-trip" && !locked) setShowForm(true);
      } catch {
        /* */
      }
    };
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, [locked]);

  useEffect(() => {
    const open = () => {
      if (!locked) setShowForm(true);
    };
    window.addEventListener("kaviro:open-create-trip", open);
    return () => window.removeEventListener("kaviro:open-create-trip", open);
  }, [locked]);

  return (
    <div className="space-y-4">
      {locked ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <div>
            El plan gratuito permite hasta <strong>{FREE_TRIP_LIMIT} viajes</strong>. Hazte Premium para crear más viajes.
          </div>
          <div className="mt-2">
            <Link
              href="/account?upgrade=premium&focus=premium#premium-plans"
              className="inline-flex items-center justify-center rounded-full bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
            >
              Mejorar a Premium
            </Link>
          </div>
        </div>
      ) : null}
      {!showForm ? (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          disabled={locked}
          className="inline-flex min-h-[48px] w-full items-center justify-center rounded-2xl border border-violet-200/80 bg-violet-50/50 px-6 py-3 text-sm font-semibold text-violet-950 shadow-sm transition hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          Abrir formulario de creación
        </button>
      ) : (
        <div className="space-y-4">
          <CreateTripForm isPremium={isPremium} />
          <button
            type="button"
            onClick={() => setShowForm(false)}
            className="text-sm font-medium text-slate-500 transition hover:text-slate-700"
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
