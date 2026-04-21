"use client";

import { useEffect, useMemo, useState } from "react";
import ExpenseForm from "@/components/trip/expenses/ExpenseForm";
import ExpenseList from "@/components/trip/expenses/ExpenseList";
import ExpenseBalancePanel from "@/components/trip/expenses/ExpenseBalancePanel";
import CurrencyConverterCard from "@/components/trip/expenses/CurrencyConverterCard";
import ExpenseAnalyzerPanel, { type ExpenseDetectedData } from "@/components/trip/expenses/ExpenseAnalyzerPanel";
import { useTripExpenses } from "@/hooks/useTripExpenses";
import { ChevronDown, Clock, Download, Plus, ScanText, Wallet } from "lucide-react";
import Link from "next/link";

export default function TripExpensesView({
  tripId,
  isPremium = true,
}: {
  tripId: string;
  isPremium?: boolean;
}) {
  const {
    expenses,
    registeredTravelers,
    tripBaseCurrency,
    participants,
    balances,
    suggestedSettlements,
    settlementWarning,
    paymentPreferences,
    savePaymentPreference,
    paymentPairRules,
    savePaymentPairRule,
    resetPaymentPairRules,
    resetAllPaymentRules,
    strictPaymentMethods,
    setStrictPaymentMethods,
    balanceCurrency,
    setBalanceCurrency,
    loading,
    saving,
    error,
    reload,
    createExpense,
    updateExpense,
    deleteExpense,
    toggleSettlementStatus,
    convertAmount,
    createWhatsAppLink,
  } = useTripExpenses(tripId);

  const [editingExpense, setEditingExpense] = useState<any | null>(null);
  const [detectedData, setDetectedData] = useState<ExpenseDetectedData | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAnalyzeOpen, setIsAnalyzeOpen] = useState(false);
  const [isConverterOpen, setIsConverterOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);

  const shouldShowForm = isAddOpen || !!editingExpense || !!detectedData;

  useEffect(() => {
    let cancelled = false;
    async function loadHistory() {
      if (!historyOpen) return;
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const resp = await fetch(
          `/api/trip-audit?tripId=${encodeURIComponent(tripId)}&entityType=expense&limit=40`,
          { cache: "no-store" }
        );
        const payload = await resp.json().catch(() => null);
        if (!resp.ok) throw new Error(payload?.error || "No se pudo cargar el historial.");
        if (!cancelled) setHistory(Array.isArray(payload?.logs) ? payload.logs : []);
      } catch (e) {
        if (!cancelled) setHistoryError(e instanceof Error ? e.message : "No se pudo cargar el historial.");
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }
    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [historyOpen, tripId]);

  function csvEscape(value: unknown, delimiter: string) {
    const text = String(value ?? "");
    const needsQuotes =
      text.includes('"') || text.includes("\n") || text.includes("\r") || text.includes(delimiter);
    const escaped = text.replaceAll(`"`, `""`);
    return needsQuotes ? `"${escaped}"` : escaped;
  }

  function downloadCsv(
    filename: string,
    rows: Array<Record<string, unknown>>,
    options?: { delimiter?: string }
  ) {
    const delimiter = options?.delimiter || ";";
    const headers = rows.length ? Object.keys(rows[0]) : [];
    const lines = [
      headers.map((h) => csvEscape(h, delimiter)).join(delimiter),
      ...rows.map((r) => headers.map((h) => csvEscape((r as any)[h], delimiter)).join(delimiter)),
    ].join("\r\n");

    // BOM UTF-8 para que Excel detecte bien acentos y separador
    const blob = new Blob(["\uFEFF", lines], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    if (editingExpense || detectedData) {
      setIsAddOpen(true);
    }
  }, [editingExpense, detectedData]);

  useEffect(() => {
    if (editingExpense) {
      setIsAnalyzeOpen(false);
    }
  }, [editingExpense]);

  const topButtons = useMemo(() => {
    const base =
      "inline-flex min-w-0 max-w-full items-center justify-center gap-2 whitespace-normal rounded-full border bg-white px-3 py-2 text-sm font-semibold shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60 sm:px-4";
    const primary = `${base} border-violet-200 text-violet-800 hover:border-violet-300 hover:bg-violet-50`;
    const secondary = `${base} border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50`;

    return (
      <div className="flex min-w-0 max-w-full flex-wrap gap-2">
        <button
          type="button"
          className={secondary}
          onClick={() => setHistoryOpen((v) => !v)}
          title="Ver historial de cambios"
        >
          <Clock className="h-4 w-4" aria-hidden />
          Historial
        </button>
        <button
          type="button"
          className={secondary}
          onClick={() => setExportOpen((v) => !v)}
          title="Exportar gastos y pagos"
        >
          <Download className="h-4 w-4" aria-hidden />
          Exportar CSV
        </button>
        <button
          type="button"
          className={primary}
          onClick={() => {
            setIsAddOpen((v) => !v);
            setIsAnalyzeOpen(false);
          }}
        >
          <Plus className="h-4 w-4" aria-hidden />
          {shouldShowForm ? "Cerrar añadir" : "Añadir ticket"}
        </button>
        <button
          type="button"
          className={secondary}
          onClick={() => {
            if (!isPremium) return;
            setIsAnalyzeOpen((v) => !v);
            if (!isAnalyzeOpen) setIsAddOpen(false);
          }}
          disabled={!isPremium}
        >
          <ScanText className="h-4 w-4" aria-hidden />
          {isAnalyzeOpen ? "Cerrar análisis" : "Analizar ticket"}
        </button>
      </div>
    );
  }, [isAnalyzeOpen, shouldShowForm, isPremium]);

  if (loading) {
    return (
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="text-lg font-semibold text-slate-900">Cargando gastos...</div>
        <div className="text-sm text-slate-500">Estamos recuperando los datos del viaje.</div>
      </div>
    );
  }

  return (
    <div className="min-w-0 max-w-full space-y-6 overflow-x-hidden">
      {error ? (
        <div className="break-words rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <div className="font-semibold">No se pudieron cargar bien los gastos.</div>
          <div className="mt-1">{error}</div>
          <button
            type="button"
            onClick={() => void reload()}
            className="mt-3 rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Reintentar
          </button>
        </div>
      ) : null}

      <div className="card-soft relative overflow-hidden p-4">
        <div
          className="pointer-events-none absolute inset-0 opacity-100"
          style={{
            background:
              "radial-gradient(900px 160px at 0% 0%, rgba(139,92,246,0.18), transparent 60%), radial-gradient(700px 180px at 100% 0%, rgba(99,102,241,0.14), transparent 55%)",
          }}
          aria-hidden
        />
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Wallet className="h-4 w-4 text-violet-700" aria-hidden />
              Gastos
            </div>
            <div className="mt-1 text-xs text-slate-600">
              Mantén el balance al día: añade tickets, analiza PDFs/imágenes y comparte pagos pendientes.
            </div>
          </div>
          <div className="min-w-0 max-w-full">{topButtons}</div>
        </div>
      </div>

      {!isPremium ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950">
          <div className="font-semibold">Desbloquea esta funcionalidad con el plan Premium.</div>
          <div className="mt-1 text-amber-900/80">
            En la versión gratuita puedes registrar y dividir gastos, pero el análisis de documentos (PDF/imagen) está deshabilitado.
          </div>
          <div className="mt-3">
            <Link
              href="/account?upgrade=premium&focus=premium#premium-plans"
              className="inline-flex items-center justify-center rounded-full bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
            >
              Mejorar a Premium
            </Link>
          </div>
        </div>
      ) : null}

      {exportOpen ? (
        <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-white via-violet-50/40 to-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-950">Exportar</div>
              <div className="mt-1 text-xs text-slate-600">
                Descarga un CSV para contabilidad o para compartir con el grupo.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setExportOpen(false)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cerrar
            </button>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                const rows = (expenses || []).map((e: any) => ({
                  "Nombre del gasto": e.title || "",
                  Fecha: e.expense_date || "",
                  Cantidad: `${Number(e.amount || 0).toFixed(2)} ${String(e.currency || "").toUpperCase()}`.trim(),
                  "Pagado por": e.payer_name || "",
                  "Repartir pago entre": Array.isArray(e.owed_by_names) ? e.owed_by_names.join(" | ") : "",
                  Categoría: e.category || "",
                }));
                downloadCsv(`trip-${tripId}-gastos.csv`, rows, { delimiter: ";" });
              }}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100"
            >
              Descargar gastos.csv
            </button>

            <button
              type="button"
              onClick={() => {
                const rows = (suggestedSettlements || []).map((s: any) => ({
                  id: s.id || "",
                  deudor: s.debtor_name || "",
                  acreedor: s.creditor_name || "",
                  importe: Number(s.amount || 0),
                  moneda: s.currency || "",
                  estado: s.status || "pending",
                  metodo: s.payment_method || "",
                }));
                downloadCsv(`trip-${tripId}-pagos.csv`, rows, { delimiter: ";" });
              }}
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100"
            >
              Descargar pagos.csv
            </button>
          </div>
        </div>
      ) : null}

      {historyOpen ? (
        <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-white via-violet-50/40 to-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-950">Historial de cambios</div>
              <div className="mt-1 text-xs text-slate-600">Quién creó/editó/eliminó gastos recientemente.</div>
            </div>
            <button
              type="button"
              onClick={() => setHistoryOpen(false)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cerrar
            </button>
          </div>

          {historyLoading ? (
            <div className="mt-4 text-sm text-slate-600">Cargando historial…</div>
          ) : historyError ? (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {historyError}
            </div>
          ) : history.length ? (
            <div className="mt-4 space-y-2">
              {history.map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-950">
                        {item.summary || `${item.action} ${item.entity_type}`}
                      </div>
                      <div className="mt-1 text-xs text-slate-600">
                        {(item.actor_email || "Alguien")} · {new Date(item.created_at).toLocaleString("es-ES")}
                      </div>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                      {item.action}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 text-sm text-slate-600">Todavía no hay cambios registrados.</div>
          )}
        </div>
      ) : null}

      <div className="grid min-w-0 max-w-full gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="min-w-0 space-y-4">
          <details
            className="rounded-2xl border border-violet-200 bg-gradient-to-br from-white via-violet-50/35 to-white shadow-sm open:shadow-md"
            open={isAnalyzeOpen}
            onToggle={(e) => setIsAnalyzeOpen((e.currentTarget as HTMLDetailsElement).open)}
          >
            <summary className="flex min-w-0 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-4 hover:bg-violet-50/40 sm:px-5">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <ScanText className="h-4 w-4 shrink-0 text-slate-700" aria-hidden />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-950">Analizar ticket</div>
                  <div className="text-xs text-slate-600">Sube un PDF/imagen y rellena el gasto automáticamente.</div>
                </div>
              </div>
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition group-open:rotate-180" aria-hidden />
            </summary>
            <div className="border-t border-slate-200 px-5 py-5">
              {isPremium ? (
                <ExpenseAnalyzerPanel
                  tripBaseCurrency={tripBaseCurrency || "EUR"}
                  onUseDetectedData={(data) => {
                    setDetectedData(data);
                    setIsAnalyzeOpen(false);
                    setIsAddOpen(true);
                  }}
                />
              ) : (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                  <div className="font-semibold">Desbloquea esta funcionalidad con el plan Premium.</div>
                  <div className="mt-1 text-amber-900/80">
                    El análisis de documentos está deshabilitado en la versión gratuita.
                  </div>
                  <div className="mt-3">
                    <Link
                      href="/account?upgrade=premium&focus=premium#premium-plans"
                      className="inline-flex items-center justify-center rounded-full bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                    >
                      Mejorar a Premium
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </details>

          <details
            className="rounded-2xl border border-violet-200 bg-gradient-to-br from-white via-violet-50/35 to-white shadow-sm open:shadow-md"
            open={shouldShowForm}
            onToggle={(e) => {
              const open = (e.currentTarget as HTMLDetailsElement).open;
              setIsAddOpen(open);
              if (!open) {
                setEditingExpense(null);
                setDetectedData(null);
              }
            }}
          >
            <summary className="flex min-w-0 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-4 hover:bg-violet-50/40 sm:px-5">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <Plus className="h-4 w-4 shrink-0 text-violet-700" aria-hidden />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-950">{editingExpense ? "Editar gasto" : "Añadir gasto"}</div>
                  <div className="text-xs text-slate-600">Define importe, participantes, categoría y notas.</div>
                </div>
              </div>
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition group-open:rotate-180" aria-hidden />
            </summary>
            <div className="border-t border-slate-200 px-5 py-5">
              <ExpenseForm
                saving={saving}
                existingParticipants={participants}
                registeredTravelers={registeredTravelers}
                baseCurrency={tripBaseCurrency || "EUR"}
                editingExpense={editingExpense}
                detectedData={detectedData}
                onCancelEdit={() => {
                  setEditingExpense(null);
                  setDetectedData(null);
                  setIsAddOpen(false);
                }}
                onSubmit={async (input) => {
                  if (editingExpense?.id) {
                    await updateExpense(editingExpense.id, input, editingExpense);
                    setEditingExpense(null);
                  } else {
                    await createExpense(input);
                  }
                  setDetectedData(null);
                  setIsAddOpen(false);
                }}
              />
            </div>
          </details>

          <details
            className="rounded-2xl border border-violet-200 bg-gradient-to-br from-white via-violet-50/35 to-white shadow-sm open:shadow-md"
            open={isConverterOpen}
            onToggle={(e) => setIsConverterOpen((e.currentTarget as HTMLDetailsElement).open)}
          >
            <summary className="flex min-w-0 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-4 hover:bg-violet-50/40 sm:px-5">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-950">Convertidor de moneda</div>
                <div className="text-xs text-slate-600">Convierte importes y ajusta la moneda de balance.</div>
              </div>
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 transition group-open:rotate-180" aria-hidden />
            </summary>
            <div className="border-t border-slate-200 px-5 py-5">
              <CurrencyConverterCard
                onConvert={convertAmount}
                balanceCurrency={balanceCurrency}
                onChangeBalanceCurrency={setBalanceCurrency}
              />
            </div>
          </details>

          <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-white via-violet-50/25 to-white shadow-sm">
            <div className="flex flex-col gap-2 border-b border-violet-200/80 bg-violet-50/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-sm font-semibold text-slate-950">Listado de gastos</div>
                <div className="mt-1 text-xs text-slate-600">Edita, elimina y revisa todos los tickets registrados.</div>
              </div>
            </div>
            <div className="px-4 py-4">
              <ExpenseList
                expenses={expenses as any}
                onEdit={(expense) => {
                  setEditingExpense(expense);
                  setDetectedData(null);
                  setIsAddOpen(true);
                }}
                onDuplicate={(expense) => {
                  setEditingExpense({
                    ...expense,
                    id: undefined,
                    attachment_name: null,
                  });
                  setDetectedData(null);
                  setIsAddOpen(true);
                }}
                onDelete={deleteExpense}
              />
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-4">
          <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-white via-violet-50/25 to-white shadow-sm">
            <div className="border-b border-violet-200/80 bg-violet-50/50 px-5 py-4">
              <div className="text-sm font-semibold text-slate-950">Balances y pagos</div>
              <div className="mt-1 text-xs text-slate-600">Quién debe a quién y enlaces rápidos por WhatsApp.</div>
            </div>
            <div className="px-4 py-4">
              <ExpenseBalancePanel
                balances={balances}
                settlements={suggestedSettlements}
                balanceCurrency={balanceCurrency}
                onChangeBalanceCurrency={setBalanceCurrency}
                onToggleSettlementStatus={toggleSettlementStatus}
                createWhatsAppLink={createWhatsAppLink}
                settlementWarning={settlementWarning}
                participants={participants}
                paymentPreferences={paymentPreferences}
                onSavePaymentPreference={savePaymentPreference}
                paymentPairRules={paymentPairRules}
                onSavePaymentPairRule={savePaymentPairRule}
                onResetPaymentPairRules={resetPaymentPairRules}
                onResetAllPaymentRules={() => resetAllPaymentRules(participants)}
                strictPaymentMethods={strictPaymentMethods}
                onChangeStrictPaymentMethods={setStrictPaymentMethods}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Listado movido dentro de la columna izquierda del grid */}
    </div>
  );
}
