"use client";

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
      ) : (
        <CreateTripForm isPremium={isPremium} />
      )}
    </div>
  );
}
