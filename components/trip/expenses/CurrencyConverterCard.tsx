"use client";

import { useState } from "react";
import { ALL_CURRENCIES } from "@/lib/currencies";

type Props = {
  onConvert: (amount: number, from: string, to: string) => Promise<number>;
  balanceCurrency: string;
  onChangeBalanceCurrency: (currency: string) => void;
};

export default function CurrencyConverterCard({
  onConvert,
  balanceCurrency,
  onChangeBalanceCurrency,
}: Props) {
  const [amount, setAmount] = useState("100");
  const [from, setFrom] = useState("EUR");
  const [to, setTo] = useState("USD");
  const [result, setResult] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleConvert() {
    setError(null);
    setLoading(true);
    try {
      const numeric = Number(amount);
      if (!Number.isFinite(numeric) || numeric <= 0) {
        throw new Error("El importe no es válido.");
      }
      const converted = await onConvert(numeric, from, to);
      setResult(converted);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo convertir.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="inline-flex items-center gap-2 rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
        <span>💱</span>
        <span>Conversión de moneda</span>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-4">
        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-800">Importe</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3" />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-800">Desde</span>
          <select value={from} onChange={(e) => setFrom(e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3">
            {ALL_CURRENCIES.map((item) => <option key={item.code} value={item.code}>{item.code} · {item.name}</option>)}
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-800">A</span>
          <select value={to} onChange={(e) => setTo(e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3">
            {ALL_CURRENCIES.map((item) => <option key={item.code} value={item.code}>{item.code} · {item.name}</option>)}
          </select>
        </label>

        <div className="flex items-end">
          <button type="button" onClick={handleConvert} disabled={loading} className={`w-full rounded-xl px-4 py-3 text-sm font-semibold ${loading ? "bg-slate-200 text-slate-500" : "bg-slate-950 text-white"}`}>
            {loading ? "Convirtiendo..." : "Convertir"}
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="text-sm font-semibold text-slate-900">Moneda del balance</div>
        <div className="mt-2 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
          <p className="text-sm text-slate-600">
            El balance de gastos y las deudas se recalcularán en la moneda que elijas.
          </p>
          <select value={balanceCurrency} onChange={(e) => onChangeBalanceCurrency(e.target.value)} className="rounded-xl border border-slate-300 px-4 py-3">
            {ALL_CURRENCIES.map((item) => <option key={item.code} value={item.code}>{item.code} · {item.name}</option>)}
          </select>
        </div>
      </div>

      {result != null ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Resultado: {result.toFixed(2)} {to}
        </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
    </div>
  );
}
