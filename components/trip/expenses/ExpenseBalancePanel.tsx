"use client";

type Settlement = {
  from: string;
  to: string;
  amount: number;
  currency?: string | null;
};

type Props = {
  currency?: string | null;
  totalExpenses?: number;
  totalPerPerson?: number;
  settlements?: Settlement[];
};

function safeCurrency(currency?: string | null) {
  const code = (currency || "EUR").toUpperCase().trim();
  return /^[A-Z]{3}$/.test(code) ? code : "EUR";
}

function formatMoney(value: number, currency?: string | null) {
  const safe = safeCurrency(currency);

  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: safe,
      maximumFractionDigits: 2,
    }).format(value || 0);
  } catch {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 2,
    }).format(value || 0);
  }
}

export default function ExpenseBalancePanel({
  currency,
  totalExpenses = 0,
  totalPerPerson = 0,
  settlements = [],
}: Props) {
  const displayCurrency = safeCurrency(currency);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Total gastos
          </p>
          <p className="mt-3 text-2xl font-black text-slate-950">
            {formatMoney(totalExpenses, displayCurrency)}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Media por persona
          </p>
          <p className="mt-3 text-2xl font-black text-slate-950">
            {formatMoney(totalPerPerson, displayCurrency)}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-slate-950">Liquidaciones</h3>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            {settlements.length} movimientos
          </span>
        </div>

        {settlements.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">
            No hay liquidaciones pendientes.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {settlements.map((item, index) => (
              <div
                key={`${item.from}-${item.to}-${index}`}
                className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-700"
              >
                <span className="font-semibold text-slate-950">{item.from}</span>
                <span> debe a </span>
                <span className="font-semibold text-slate-950">{item.to}</span>
                <span> · </span>
                <span className="font-semibold text-slate-950">
                  {formatMoney(item.amount, item.currency || displayCurrency)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
