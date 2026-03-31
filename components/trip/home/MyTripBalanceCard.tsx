"use client";

import { useParticipantBalances } from "@/hooks/useParticipantBalance";

type Props = {
  tripId: string;
  participantId: string;
  participantName: string;
  currency?: string | null;
};

export default function MyTripBalanceCard({
  tripId,
  participantId,
  participantName,
  currency = "EUR",
}: Props) {
  const { balancesByParticipantId, loading, error } = useParticipantBalances(tripId);
  const row = balancesByParticipantId[participantId] ?? {
    participantId,
    paid: 0,
    owed: 0,
    net: 0,
  };

  const formatter = new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: currency || "EUR",
    maximumFractionDigits: 2,
  });

  return (
    <section className="card-soft p-6">
      <div className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
        Tu balance
      </div>
      <h2 className="mt-3 text-2xl font-bold text-slate-950">Split de {participantName}</h2>

      {loading ? <p className="mt-3 text-sm text-slate-500">Calculando balance...</p> : null}
      {!loading && error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}

      {!loading && !error ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Metric label="Pagado" value={formatter.format(row.paid)} />
          <Metric label="Te corresponde" value={formatter.format(row.owed)} />
          <Metric
            label="Balance neto"
            value={row.net >= 0 ? `+ ${formatter.format(row.net)}` : `- ${formatter.format(Math.abs(row.net))}`}
            positive={row.net >= 0}
          />
        </div>
      ) : null}
    </section>
  );
}

function Metric({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-2 text-lg font-bold ${positive == null ? "text-slate-950" : positive ? "text-emerald-700" : "text-rose-700"}`}>{value}</div>
    </div>
  );
}
