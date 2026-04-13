"use client";

import { useState } from "react";
import CreateTripForm from "./CreateTripForm";

export default function CreateTripSection({
  isPremium,
  hasAnyTrip,
}: {
  isPremium: boolean;
  hasAnyTrip: boolean;
}) {
  const [showForm, setShowForm] = useState(false);
  const locked = !isPremium && hasAnyTrip;

  return (
    <div className="space-y-4">
      {locked ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          El plan gratuito solo permite <strong>1 viaje activo</strong>. Hazte Premium para crear más viajes.
        </div>
      ) : null}
      {!showForm ? (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          disabled={locked}
          className="inline-flex min-h-[44px] items-center justify-center rounded-2xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          + Crear nuevo viaje
        </button>
      ) : (
        <div className="space-y-4">
          <CreateTripForm />
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
