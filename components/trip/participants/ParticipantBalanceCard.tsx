"use client";

import type { ParticipantBalanceSummary } from "@/hooks/useParticipantBalance";

export default function ParticipantBalanceCard({
  balance,
}: {
  balance: ParticipantBalanceSummary;
}) {
  const currencyFormatter = new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <div className="grid grid-cols-3 gap-3 rounded-2xl bg-gray-50 p-3 text-sm">
      <Metric label="Pagado" value={currencyFormatter.format(balance.paid)} />
      <Metric label="Debe" value={currencyFormatter.format(balance.owed)} />
      <Metric
        label="Saldo"
        value={currencyFormatter.format(balance.net)}
        strong
      />
    </div>
  );
}

function Metric({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className={strong ? "font-semibold text-black" : "font-medium text-gray-800"}>{value}</div>
    </div>
  );
}
