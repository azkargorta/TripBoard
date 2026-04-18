"use client";

import { useCallback, useEffect, useState } from "react";
import CreateTripForm from "./CreateTripForm";
import Link from "next/link";

export default function CreateTripSection({
  isPremium,
  tripCount,
}: {
  isPremium: boolean;
  tripCount: number;
}) {
  const FREE_TRIP_LIMIT = 3;
  const locked = !isPremium && tripCount >= FREE_TRIP_LIMIT;
  const [showForm, setShowForm] = useState(false);

  const syncOpenFromHash = useCallback(() => {
    if (locked) return;
    try {
      if (window.location.hash === "#create-trip") setShowForm(true);
    } catch {
      /* */
    }
  }, [locked]);

  useEffect(() => {
    syncOpenFromHash();
    window.addEventListener("hashchange", syncOpenFromHash);
    return () => window.removeEventListener("hashchange", syncOpenFromHash);
  }, [syncOpenFromHash]);

  useEffect(() => {
    const open = () => {
      if (!locked) setShowForm(true);
    };
    window.addEventListener("kaviro:open-create-trip", open);
    return () => window.removeEventListener("kaviro:open-create-trip", open);
  }, [locked]);

  return (
    <div className="space-y-3">
      {locked ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-950">
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
      ) : showForm ? (
        <div className="space-y-3">
          <CreateTripForm isPremium={isPremium} />
          <button
            type="button"
            onClick={() => setShowForm(false)}
            className="text-sm font-medium text-slate-500 transition hover:text-slate-700"
          >
            Cerrar formulario
          </button>
        </div>
      ) : null}
    </div>
  );
}
