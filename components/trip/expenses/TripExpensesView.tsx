"use client";

import { useEffect, useMemo, useState } from "react";
import ExpenseForm from "@/components/trip/expenses/ExpenseForm";
import ExpenseList from "@/components/trip/expenses/ExpenseList";
import ExpenseBalancePanel from "@/components/trip/expenses/ExpenseBalancePanel";
import CurrencyConverterCard from "@/components/trip/expenses/CurrencyConverterCard";
import ExpenseAnalyzerPanel, { type ExpenseDetectedData } from "@/components/trip/expenses/ExpenseAnalyzerPanel";
import { useTripExpenses } from "@/hooks/useTripExpenses";
import { ChevronDown, Plus, ScanText, Wallet } from "lucide-react";

export default function TripExpensesView({ tripId }: { tripId: string }) {
  const {
    expenses,
    registeredTravelers,
    tripBaseCurrency,
    participants,
    balances,
    suggestedSettlements,
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

  const shouldShowForm = isAddOpen || !!editingExpense || !!detectedData;

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
      "inline-flex items-center justify-center gap-2 rounded-full border bg-white px-4 py-2 text-sm font-semibold shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60";
    const primary = `${base} border-violet-200 text-violet-800 hover:border-violet-300 hover:bg-violet-50`;
    const secondary = `${base} border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50`;

    return (
      <div className="flex flex-wrap gap-2">
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
            setIsAnalyzeOpen((v) => !v);
            if (!isAnalyzeOpen) setIsAddOpen(false);
          }}
        >
          <ScanText className="h-4 w-4" aria-hidden />
          {isAnalyzeOpen ? "Cerrar análisis" : "Analizar ticket"}
        </button>
      </div>
    );
  }, [isAnalyzeOpen, shouldShowForm]);

  if (loading) {
    return (
      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="text-lg font-semibold text-slate-900">Cargando gastos...</div>
        <div className="text-sm text-slate-500">Estamos recuperando los datos del viaje.</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
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

      <div className="card-soft p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Wallet className="h-4 w-4 text-violet-700" aria-hidden />
              Gastos
            </div>
            <div className="mt-1 text-xs text-slate-600">
              Mantén el balance al día: añade tickets, analiza PDFs/imágenes y comparte pagos pendientes.
            </div>
          </div>
          {topButtons}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-4">
          <details
            className="rounded-2xl border border-slate-200 bg-white shadow-sm open:shadow-md"
            open={isAnalyzeOpen}
            onToggle={(e) => setIsAnalyzeOpen((e.currentTarget as HTMLDetailsElement).open)}
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
              <div className="flex items-center gap-2">
                <ScanText className="h-4 w-4 text-slate-700" aria-hidden />
                <div>
                  <div className="text-sm font-semibold text-slate-950">Analizar ticket</div>
                  <div className="text-xs text-slate-600">Sube un PDF/imagen y rellena el gasto automáticamente.</div>
                </div>
              </div>
              <ChevronDown className="h-4 w-4 text-slate-500 transition group-open:rotate-180" aria-hidden />
            </summary>
            <div className="border-t border-slate-200 px-5 py-5">
              <ExpenseAnalyzerPanel
                tripBaseCurrency={tripBaseCurrency || "EUR"}
                onUseDetectedData={(data) => {
                  setDetectedData(data);
                  setIsAnalyzeOpen(false);
                  setIsAddOpen(true);
                }}
              />
            </div>
          </details>

          <details
            className="rounded-2xl border border-slate-200 bg-white shadow-sm open:shadow-md"
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
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
              <div className="flex items-center gap-2">
                <Plus className="h-4 w-4 text-violet-700" aria-hidden />
                <div>
                  <div className="text-sm font-semibold text-slate-950">{editingExpense ? "Editar gasto" : "Añadir gasto"}</div>
                  <div className="text-xs text-slate-600">Define importe, participantes, categoría y notas.</div>
                </div>
              </div>
              <ChevronDown className="h-4 w-4 text-slate-500 transition group-open:rotate-180" aria-hidden />
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
            className="rounded-2xl border border-slate-200 bg-white shadow-sm open:shadow-md"
            open={isConverterOpen}
            onToggle={(e) => setIsConverterOpen((e.currentTarget as HTMLDetailsElement).open)}
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4">
              <div>
                <div className="text-sm font-semibold text-slate-950">Convertidor de moneda</div>
                <div className="text-xs text-slate-600">Convierte importes y ajusta la moneda de balance.</div>
              </div>
              <ChevronDown className="h-4 w-4 text-slate-500 transition group-open:rotate-180" aria-hidden />
            </summary>
            <div className="border-t border-slate-200 px-5 py-5">
              <CurrencyConverterCard
                onConvert={convertAmount}
                balanceCurrency={balanceCurrency}
                onChangeBalanceCurrency={setBalanceCurrency}
              />
            </div>
          </details>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
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
              />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
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
              setIsAddOpen(true);
            }}
            onDelete={deleteExpense}
          />
        </div>
      </div>
    </div>
  );
}
