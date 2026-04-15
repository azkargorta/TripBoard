"use client";

import { useState } from "react";
import CreateTripForm from "./CreateTripForm";
import Link from "next/link";

export default function CreateTripSection({
  isPremium,
  tripCount,
}: {
  isPremium: boolean;
  tripCount: number;
}) {
  const [showForm, setShowForm] = useState(false);
  const FREE_TRIP_LIMIT = 3;
  const locked = !isPremium && tripCount >= FREE_TRIP_LIMIT;

  return (
    <div className="space-y-4">
      {locked ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <div>
            El plan gratuito permite hasta <strong>{FREE_TRIP_LIMIT} viajes activos</strong>. Hazte Premium para crear más viajes.
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
          className="inline-flex min-h-[44px] items-center justify-center rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
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
