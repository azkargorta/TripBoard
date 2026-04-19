"use client";

import { getCurrencyMeta } from "@/lib/currencies";

type Expense = {
  id: string;
  title: string;
  category?: string | null;
  payer_name?: string | null;
  participant_names?: string[] | null;
  paid_by_names?: string[] | null;
  owed_by_names?: string[] | null;
  amount: number;
  currency: string;
  expense_date?: string | null;
  notes?: string | null;
  attachment_name?: string | null;
};

function normalizeParticipants(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function ExpenseList({
  expenses,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  expenses: Expense[];
  onEdit: (expense: Expense) => void;
  onDuplicate: (expense: Expense) => void;
  onDelete: (expenseId: string) => Promise<void>;
}) {
  return (
    <div className="min-w-0 max-w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h3 className="text-lg font-semibold text-slate-900">Gastos registrados</h3>
      <div className="mt-4 space-y-4">
        {expenses.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
            Todavía no hay gastos.
          </div>
        ) : (
          expenses.map((expense) => {
            const currency = getCurrencyMeta(expense.currency);
            const participants = normalizeParticipants(expense.participant_names);
            const paidBy = normalizeParticipants(expense.paid_by_names);
            const owedBy = normalizeParticipants(expense.owed_by_names);

            return (
              <div key={expense.id} className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0 max-w-full flex-1">
                    <h4 className="break-words text-base font-semibold text-slate-900">{expense.title || "Gasto sin título"}</h4>
                    <div className="mt-2 space-y-1 break-words text-sm text-slate-600">
                      <p>Pagador principal: {expense.payer_name || "Sin indicar"}</p>
                      <p>Viajeros implicados: {participants.length ? participants.join(", ") : "Sin viajeros"}</p>
                      <p>Han pagado: {paidBy.length ? paidBy.join(", ") : "Sin definir"}</p>
                      <p>Repartido entre: {owedBy.length ? owedBy.join(", ") : "Sin definir"}</p>
                      {expense.expense_date ? <p>Fecha: {expense.expense_date}</p> : null}
                      {expense.category ? <p>Categoría: {expense.category}</p> : null}
                      {expense.attachment_name ? <p>Archivo: {expense.attachment_name}</p> : null}
                    </div>
                  </div>
                  <div className="shrink-0 text-left sm:text-right">
                    <div className="text-lg font-bold text-slate-950">{currency.symbol} {Number(expense.amount || 0).toFixed(2)}</div>
                    <div className="text-xs text-slate-500">{expense.currency}</div>
                  </div>
                </div>

                {expense.notes ? <p className="mt-3 break-words text-sm text-slate-600">{expense.notes}</p> : null}

                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={() => onEdit(expense)} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900">Editar</button>
                  <button type="button" onClick={() => onDuplicate(expense)} className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900">Duplicar</button>
                  <button type="button" onClick={() => onDelete(expense.id)} className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700">Eliminar</button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
