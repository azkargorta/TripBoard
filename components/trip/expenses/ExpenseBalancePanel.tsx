"use client";

import { useMemo, useState } from "react";
import type {
  BalanceRow,
  PaymentMethod,
  PaymentPairRuleRow,
  PaymentPreferenceRow,
  SettlementSuggestion,
} from "@/lib/expense-balance";
import { CheckCircle2, Clock, Copy, MessageCircle, Settings2, SlidersHorizontal, Users } from "lucide-react";

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
  settlementWarning: string | null;
  participants: string[];
  paymentPreferences: PaymentPreferenceRow[];
  onSavePaymentPreference: (participantName: string, next: { send_methods: string[]; receive_methods: string[] }) => Promise<void>;
  paymentPairRules: PaymentPairRuleRow[];
  onSavePaymentPairRule: (fromName: string, toName: string, patch: { allowed: boolean; prefer: boolean }) => Promise<void>;
  onResetPaymentPairRules: (fromName: string, toParticipantNames: string[]) => Promise<void>;
  onResetAllPaymentRules: () => Promise<void>;
  strictPaymentMethods: boolean;
  onChangeStrictPaymentMethods: (value: boolean) => void;
};

export default function ExpenseBalancePanel({
  balances,
  settlements,
  balanceCurrency,
  onChangeBalanceCurrency,
  onToggleSettlementStatus,
  createWhatsAppLink,
  settlementWarning,
  participants,
  paymentPreferences,
  onSavePaymentPreference,
  paymentPairRules,
  onSavePaymentPairRule,
  onResetPaymentPairRules,
  onResetAllPaymentRules,
  strictPaymentMethods,
  onChangeStrictPaymentMethods,
}: Props) {
  const displayCurrency = safeCurrency(balanceCurrency);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [savingPref, setSavingPref] = useState<string | null>(null);
  const [resetAllBusy, setResetAllBusy] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkCopied, setBulkCopied] = useState(false);

  const methods: Array<{ id: PaymentMethod; label: string; chip: string }> = [
    { id: "bizum", label: "Bizum", chip: "bg-emerald-50 text-emerald-900 border-emerald-200" },
    { id: "transfer", label: "Transfer", chip: "bg-sky-50 text-sky-900 border-sky-200" },
    { id: "cash", label: "Efectivo", chip: "bg-amber-50 text-amber-950 border-amber-200" },
  ];

  const prefMap = useMemo(() => {
    const map = new Map<string, PaymentPreferenceRow>();
    for (const p of paymentPreferences || []) map.set(p.participant_name, p);
    return map;
  }, [paymentPreferences]);

  const pairRuleMap = useMemo(() => {
    const map = new Map<string, PaymentPairRuleRow>();
    for (const r of paymentPairRules || []) {
      if (!r.from_participant_name || !r.to_participant_name) continue;
      map.set(`${r.from_participant_name}->${r.to_participant_name}`, r);
    }
    return map;
  }, [paymentPairRules]);

  const effectiveParticipants = useMemo(() => {
    const set = new Set<string>();
    participants.forEach((p) => set.add(p));
    balances.forEach((b) => set.add(b.person));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [participants, balances]);

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

  const bulkReminders = useMemo(() => {
    const pending = orderedSettlements.filter((s) => s.status !== "paid");
    const byDebtor = new Map<string, SettlementSuggestion[]>();
    for (const s of pending) {
      const key = String(s.debtor_name || "").trim();
      if (!key) continue;
      const list = byDebtor.get(key) || [];
      list.push(s);
      byDebtor.set(key, list);
    }

    const items = Array.from(byDebtor.entries())
      .map(([debtor, list]) => {
        const total = list.reduce((sum, s) => sum + Number(s.amount || 0), 0);
        const currency = safeCurrency(list[0]?.currency || displayCurrency);

        const lines = list
          .slice()
          .sort((a, b) => String(a.creditor_name || "").localeCompare(String(b.creditor_name || "")))
          .map((s) => {
            const method =
              s.payment_method === "bizum"
                ? "Bizum"
                : s.payment_method === "transfer"
                  ? "Transferencia"
                  : s.payment_method === "cash"
                    ? "Efectivo"
                    : null;
            const methodPart = method ? ` · Método: ${method}` : "";
            return `- ${s.creditor_name}: ${formatMoney(Number(s.amount || 0), s.currency || currency)}${methodPart}`;
          })
          .join("\n");

        const text =
          `Hola ${debtor}.\n` +
          `Según el balance del viaje, tienes pagos pendientes por un total de ${formatMoney(total, currency)}.\n\n` +
          `Detalle:\n${lines}\n\n` +
          `Gracias.`;

        const link = `https://wa.me/?text=${encodeURIComponent(text)}`;
        return { debtor, total, currency, text, link, count: list.length };
      })
      .sort((a, b) => b.total - a.total);

    const allText = items
      .map((it) => `### ${it.debtor} (${formatMoney(it.total, it.currency)})\n${it.text}`)
      .join("\n\n");

    return { items, allText };
  }, [displayCurrency, orderedSettlements]);

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
          <div className="flex flex-wrap items-center gap-2">
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

            <button
              type="button"
              onClick={() => setPrefsOpen((v) => !v)}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Settings2 className="h-4 w-4" aria-hidden />
              Métodos
            </button>
          </div>
        </div>
      </div>

      {settlementWarning ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {settlementWarning}
        </div>
      ) : null}

      {prefsOpen ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-950">Métodos de pago por viajero</div>
              <div className="mt-1 text-xs text-slate-600">
                Define cómo puede <span className="font-semibold">pagar</span> y <span className="font-semibold">recibir</span> cada persona.
                Si el modo estricto está activo, TripBoard solo propondrá pagos posibles.
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={resetAllBusy}
                onClick={() => {
                  setResetAllBusy(true);
                  void onResetAllPaymentRules().finally(() => setResetAllBusy(false));
                }}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                {resetAllBusy ? "Restableciendo…" : "Restablecer todo"}
              </button>

              <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-800">
                <input
                  type="checkbox"
                  checked={strictPaymentMethods}
                  onChange={(e) => onChangeStrictPaymentMethods(e.target.checked)}
                />
                Modo estricto
              </label>
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            {effectiveParticipants.map((name) => {
              const pref = prefMap.get(name);
              const send = pref?.send_methods?.length ? pref.send_methods : (["bizum", "transfer", "cash"] as PaymentMethod[]);
              const receive = pref?.receive_methods?.length ? pref.receive_methods : (["bizum", "transfer", "cash"] as PaymentMethod[]);
              const others = effectiveParticipants.filter((p) => p !== name);

              async function toggle(kind: "send" | "receive", method: PaymentMethod) {
                const current = kind === "send" ? send : receive;
                const next = current.includes(method) ? current.filter((m) => m !== method) : [...current, method];
                const payload = {
                  send_methods: kind === "send" ? next : send,
                  receive_methods: kind === "receive" ? next : receive,
                };
                setSavingPref(name);
                try {
                  await onSavePaymentPreference(name, payload as any);
                } finally {
                  setSavingPref(null);
                }
              }

              async function toggleAllowed(toName: string) {
                const key = `${name}->${toName}`;
                const current = pairRuleMap.get(key);
                const allowed = current ? !current.allowed : false; // por defecto allowed=true; primer click lo bloquea
                const prefer = current?.prefer ?? false;
                setSavingPref(name);
                try {
                  await onSavePaymentPairRule(name, toName, { allowed, prefer: allowed ? prefer : false });
                } finally {
                  setSavingPref(null);
                }
              }

              async function togglePrefer(toName: string) {
                const key = `${name}->${toName}`;
                const current = pairRuleMap.get(key);
                const allowed = current?.allowed ?? true;
                if (!allowed) return; // no tiene sentido preferir si está bloqueado
                const prefer = !(current?.prefer ?? false);
                setSavingPref(name);
                try {
                  await onSavePaymentPairRule(name, toName, { allowed: true, prefer });
                } finally {
                  setSavingPref(null);
                }
              }

              async function resetAllForThisPerson() {
                setSavingPref(name);
                try {
                  await onResetPaymentPairRules(name, others);
                } finally {
                  setSavingPref(null);
                }
              }

              return (
                <div key={name} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="font-semibold text-slate-950">{name}</div>
                    {savingPref === name ? (
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">Guardando…</span>
                    ) : null}
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div>
                      <div className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-slate-500">Puede pagar con</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {methods.map((m) => {
                          const active = send.includes(m.id);
                          return (
                            <button
                              key={`send-${name}-${m.id}`}
                              type="button"
                              onClick={() => void toggle("send", m.id)}
                              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                                active ? m.chip : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                              }`}
                              aria-pressed={active}
                            >
                              {m.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-slate-500">Puede recibir por</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {methods.map((m) => {
                          const active = receive.includes(m.id);
                          return (
                            <button
                              key={`recv-${name}-${m.id}`}
                              type="button"
                              onClick={() => void toggle("receive", m.id)}
                              className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                                active ? m.chip : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                              }`}
                              aria-pressed={active}
                            >
                              {m.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-slate-500">
                        Puede pagar a
                      </div>
                      <button
                        type="button"
                        onClick={() => void resetAllForThisPerson()}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Restablecer
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {others.length ? (
                        others.map((toName) => {
                          const rule = pairRuleMap.get(`${name}->${toName}`);
                          const allowed = rule?.allowed ?? true;
                          const prefer = rule?.prefer ?? false;
                          return (
                            <div key={`${name}->${toName}`} className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => void toggleAllowed(toName)}
                                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                                  allowed
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                                    : "border-rose-200 bg-rose-50 text-rose-900"
                                }`}
                                title={allowed ? "Permitido (click para bloquear)" : "Bloqueado (click para permitir)"}
                              >
                                {allowed ? "✓" : "⛔"} {toName}
                              </button>
                              {allowed ? (
                                <button
                                  type="button"
                                  onClick={() => void togglePrefer(toName)}
                                  className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${
                                    prefer
                                      ? "border-violet-200 bg-violet-50 text-violet-900"
                                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                  }`}
                                  title={prefer ? "Preferido (click para quitar)" : "Marcar como preferido"}
                                >
                                  {prefer ? "★" : "☆"}
                                </button>
                              ) : null}
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-xs text-slate-600">Añade más viajeros para configurar parejas.</div>
                      )}
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      Consejo: deja bloqueos solo cuando sea necesario. Si el modo estricto está activo y no hay forma de saldar, TripBoard te avisará.
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

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
          <div className="flex flex-wrap items-center gap-2">
            {bulkReminders.items.length ? (
              <button
                type="button"
                onClick={() => setBulkOpen((v) => !v)}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                title="Generar avisos para todos los deudores"
              >
                <Users className="h-4 w-4" aria-hidden />
                Cobrar a todos
              </button>
            ) : null}
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {orderedSettlements.length} movimientos
            </span>
          </div>
        </div>

        {bulkOpen && bulkReminders.items.length ? (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-950">Avisos por WhatsApp</div>
                <div className="mt-1 text-xs text-slate-600">
                  Genera un mensaje por deudor con el total pendiente. Puedes copiar todo o abrir WhatsApp por persona.
                </div>
              </div>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(bulkReminders.allText);
                    setBulkCopied(true);
                    window.setTimeout(() => setBulkCopied(false), 1500);
                  } catch {
                    // ignore
                  }
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                title="Copiar todos los mensajes"
              >
                <Copy className="h-4 w-4" aria-hidden />
                {bulkCopied ? "Copiado" : "Copiar todo"}
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              {bulkReminders.items.map((it) => (
                <div key={it.debtor} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-950">{it.debtor}</div>
                      <div className="mt-1 text-xs text-slate-600">{it.count} pagos · Total {formatMoney(it.total, it.currency)}</div>
                    </div>
                    <a
                      href={it.link}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-50"
                      title="Abrir mensaje en WhatsApp"
                    >
                      <MessageCircle className="h-4 w-4" aria-hidden />
                      WhatsApp
                    </a>
                  </div>

                  <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
{it.text}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {orderedSettlements.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-slate-200 px-4 py-5 text-sm text-slate-500">
            No hay liquidaciones pendientes.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {orderedSettlements.map((s) => {
              const isPaid = s.status === "paid";
              const badge = isPaid ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900";
              const methodLabel =
                s.payment_method === "bizum" ? "Bizum" : s.payment_method === "transfer" ? "Transferencia" : s.payment_method === "cash" ? "Efectivo" : null;
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
                      {methodLabel ? (
                        <div className="mt-2">
                          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                            Método: {methodLabel}
                          </span>
                        </div>
                      ) : null}
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
