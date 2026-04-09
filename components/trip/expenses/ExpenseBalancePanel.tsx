"use client";

import { useMemo } from "react";
import type { BalanceRow, SettlementSuggestion } from "@/lib/expense-balance";
import { CheckCircle2, Clock, MessageCircle, SlidersHorizontal } from "lucide-react";

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

type Props = {
  balances: BalanceRow[];
  settlements: SettlementSuggestion[];
  balanceCurrency: string;
  onChangeBalanceCurrency: (value: string) => void;
  onToggleSettlementStatus: (settlement: SettlementSuggestion) => Promise<void>;
  createWhatsAppLink: (settlement: SettlementSuggestion) => string;
};

export default function ExpenseBalancePanel({
  balances,
  settlements,
  balanceCurrency,
  onChangeBalanceCurrency,
  onToggleSettlementStatus,
  createWhatsAppLink,
}: Props) {
  const displayCurrency = safeCurrency(balanceCurrency);

  const totals = useMemo(() => {
    const totalPaid = balances.reduce((sum, row) => sum + (row.paid || 0), 0);
    const people = balances.length || 1;
    return {
      totalExpenses: totalPaid,
      totalPerPerson: totalPaid / people,
    };
  }, [balances]);

  const orderedSettlements = useMemo(() => {
    const pending = settlements.filter((s) => s.status !== "paid");
    const paid = settlements.filter((s) => s.status === "paid");
    return [...pending, ...paid];
  }, [settlements]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Total gastos</p>
            <p className="mt-3 text-2xl font-black text-slate-950">
              {formatMoney(totals.totalExpenses, displayCurrency)}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Media por persona</p>
            <p className="mt-3 text-2xl font-black text-slate-950">
              {formatMoney(totals.totalPerPerson, displayCurrency)}
            </p>
          </div>
        </div>

        <div className="w-full sm:w-auto">
          <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm">
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            <span className="text-xs text-slate-500">Moneda balance</span>
            <select
              value={displayCurrency}
              onChange={(e) => onChangeBalanceCurrency(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-2 py-1 text-sm font-semibold text-slate-900"
            >
              {["EUR", "USD", "GBP", "ARS", "MXN", "COP", "CLP", "JPY", "CHF"].map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
              {!["EUR", "USD", "GBP", "ARS", "MXN", "COP", "CLP", "JPY", "CHF"].includes(displayCurrency) ? (
                <option value={displayCurrency}>{displayCurrency}</option>
              ) : null}
            </select>
          </label>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-slate-950">Balance por persona</h3>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            {balances.length} viajeros
          </span>
        </div>

        {balances.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">
            Añade gastos para calcular balances.
          </div>
        ) : (
          <div className="mt-4 grid gap-3">
            {balances.map((row) => (
              <div key={row.person} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="font-semibold text-slate-950">{row.person}</div>
                  <div className={`rounded-full px-3 py-1 text-xs font-semibold ${row.balance >= 0 ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                    {row.balance >= 0 ? "A favor" : "Debe"} · {formatMoney(Math.abs(row.balance), displayCurrency)}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-slate-700">
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Ha pagado</div>
                    <div className="mt-1 font-semibold text-slate-900">{formatMoney(row.paid, displayCurrency)}</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Le corresponde</div>
                    <div className="mt-1 font-semibold text-slate-900">{formatMoney(row.owed, displayCurrency)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-slate-950">Pagos a realizar</h3>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            {orderedSettlements.length} movimientos
          </span>
        </div>

        {orderedSettlements.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">
            No hay liquidaciones pendientes.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {orderedSettlements.map((s) => {
              const isPaid = s.status === "paid";
              const badge = isPaid ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900";
              return (
                <div key={s.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm text-slate-700">
                        <span className="font-semibold text-slate-950">{s.debtor_name}</span>{" "}
                        <span>debe a</span>{" "}
                        <span className="font-semibold text-slate-950">{s.creditor_name}</span>
                      </div>
                      <div className="mt-2 text-lg font-black text-slate-950">
                        {formatMoney(s.amount, s.currency || displayCurrency)}
                      </div>
                    </div>
                    <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${badge}`}>
                      {isPaid ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <Clock className="h-4 w-4" aria-hidden />}
                      {isPaid ? "Pago realizado" : "Pago pendiente"}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void onToggleSettlementStatus(s)}
                      className={`rounded-xl border px-4 py-2 text-sm font-semibold ${
                        isPaid
                          ? "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                          : "border-emerald-200 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
                      }`}
                    >
                      {isPaid ? "Marcar pendiente" : "Marcar realizado"}
                    </button>

                    <a
                      href={createWhatsAppLink(s)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-50"
                      title="Enviar aviso por WhatsApp"
                    >
                      <MessageCircle className="h-4 w-4" aria-hidden />
                      WhatsApp
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
