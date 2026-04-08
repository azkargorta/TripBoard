"use client";

import { useEffect, useMemo, useState } from "react";
import ExpenseForm from "@/components/trip/expenses/ExpenseForm";
import ExpenseList from "@/components/trip/expenses/ExpenseList";
import ExpenseBalancePanel from "@/components/trip/expenses/ExpenseBalancePanel";
import CurrencyConverterCard from "@/components/trip/expenses/CurrencyConverterCard";
import ExpenseAnalyzerPanel, { type ExpenseDetectedData } from "@/components/trip/expenses/ExpenseAnalyzerPanel";
import { useTripExpenses } from "@/hooks/useTripExpenses";
import { Plus, ScanText } from "lucide-react";

export default function TripExpensesView({ tripId }: { tripId: string }) {
  const {
    expenses,
    registeredTravelers,
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

  const shouldShowForm = isAddOpen || !!editingExpense || !!detectedData;

  useEffect(() => {
    if (editingExpense || detectedData) {
      setIsAddOpen(true);
    }
  }, [editingExpense, detectedData]);

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

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900">Acciones rápidas</div>
          <div className="mt-1 text-xs text-slate-600">Añade un gasto manualmente o analiza un PDF/imagen del ticket.</div>
        </div>
        {topButtons}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {isAnalyzeOpen ? (
          <ExpenseAnalyzerPanel
            onUseDetectedData={(data) => {
              setDetectedData(data);
              setIsAnalyzeOpen(false);
              setIsAddOpen(true);
            }}
          />
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
            Pulsa <span className="font-semibold">Analizar ticket</span> para subir un PDF o imagen y rellenar el gasto automáticamente.
          </div>
        )}
        <CurrencyConverterCard onConvert={convertAmount} balanceCurrency={balanceCurrency} onChangeBalanceCurrency={setBalanceCurrency} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {shouldShowForm ? (
          <ExpenseForm
            saving={saving}
            existingParticipants={participants}
            registeredTravelers={registeredTravelers}
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
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
            Pulsa <span className="font-semibold">Añadir ticket</span> para crear un gasto. Si editas un gasto existente, el formulario se abrirá automáticamente.
          </div>
        )}

        <ExpenseBalancePanel
          balances={balances}
          settlements={suggestedSettlements}
          balanceCurrency={balanceCurrency}
          onChangeBalanceCurrency={setBalanceCurrency}
          onToggleSettlementStatus={toggleSettlementStatus}
          createWhatsAppLink={createWhatsAppLink}
        />
      </div>

      <ExpenseList expenses={expenses as any} onEdit={(expense) => setEditingExpense(expense)} onDelete={deleteExpense} />
    </div>
  );
}
