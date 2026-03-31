"use client";

import { useState } from "react";
import ExpenseForm from "@/components/trip/expenses/ExpenseForm";
import ExpenseList from "@/components/trip/expenses/ExpenseList";
import ExpenseBalancePanel from "@/components/trip/expenses/ExpenseBalancePanel";
import CurrencyConverterCard from "@/components/trip/expenses/CurrencyConverterCard";
import ExpenseAnalyzerPanel, { type ExpenseDetectedData } from "@/components/trip/expenses/ExpenseAnalyzerPanel";
import { useTripExpenses } from "@/hooks/useTripExpenses";

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
    createExpense,
    updateExpense,
    deleteExpense,
    toggleSettlementStatus,
    convertAmount,
    createWhatsAppLink,
  } = useTripExpenses(tripId);

  const [editingExpense, setEditingExpense] = useState<any | null>(null);
  const [detectedData, setDetectedData] = useState<ExpenseDetectedData | null>(null);

  if (loading) return <div className="p-4">Cargando gastos...</div>;

  return (
    <div className="space-y-6">
      {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
          <span>💸</span><span>Gastos del viaje</span>
        </div>
        <h2 className="mt-3 text-3xl font-bold text-slate-950">Balance y control de gastos</h2>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ExpenseAnalyzerPanel onUseDetectedData={setDetectedData} />
        <CurrencyConverterCard onConvert={convertAmount} balanceCurrency={balanceCurrency} onChangeBalanceCurrency={setBalanceCurrency} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ExpenseForm
          saving={saving}
          existingParticipants={participants}
          registeredTravelers={registeredTravelers}
          editingExpense={editingExpense}
          detectedData={detectedData}
          onCancelEdit={() => setEditingExpense(null)}
          onSubmit={async (input) => {
            if (editingExpense?.id) {
              await updateExpense(editingExpense.id, input, editingExpense);
              setEditingExpense(null);
            } else {
              await createExpense(input);
            }
            setDetectedData(null);
          }}
        />

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
