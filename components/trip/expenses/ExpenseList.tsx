"use client";

import { getCurrencyMeta } from "@/lib/currencies";
import LongTextSheet from "@/components/ui/LongTextSheet";
import { useMemo, useState } from "react";
import { ChevronDown, Filter, RotateCcw } from "lucide-react";

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

function categoryLabelEs(raw: string | null | undefined): string {
  const k = String(raw || "").trim().toLowerCase();
  if (!k) return "Sin categoría";
  const map: Record<string, string> = {
    tickets: "Tickets",
    ticket: "Tickets",
    food: "Comida",
    meals: "Comida",
    restaurant: "Restaurantes",
    groceries: "Supermercado",
    supermarket: "Supermercado",
    transport: "Transporte",
    transportation: "Transporte",
    lodging: "Alojamiento",
    accommodation: "Alojamiento",
    activities: "Actividades",
    activity: "Actividades",
    shopping: "Compras",
    misc: "Otros",
    other: "Otros",
    others: "Otros",
  };
  return map[k] || k.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function uniqSorted(list: string[]) {
  return Array.from(new Set(list.filter(Boolean))).sort((a, b) => a.localeCompare(b, "es"));
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [payerFilter, setPayerFilter] = useState<string>("all");
  const [owedByFilter, setOwedByFilter] = useState<string>("all");

  const filterOptions = useMemo(() => {
    const categories = uniqSorted(expenses.map((e) => String(e.category || "").trim()).filter(Boolean));
    const dates = uniqSorted(expenses.map((e) => String(e.expense_date || "").trim()).filter(Boolean));
    const payers = uniqSorted(expenses.map((e) => String(e.payer_name || "").trim()).filter(Boolean));
    const owedPeople = uniqSorted(expenses.flatMap((e) => normalizeParticipants(e.owed_by_names)));
    return { categories, dates, payers, owedPeople };
  }, [expenses]);

  const filtered = useMemo(() => {
    return expenses.filter((e) => {
      if (categoryFilter !== "all" && String(e.category || "").trim() !== categoryFilter) return false;
      if (dateFilter !== "all" && String(e.expense_date || "").trim() !== dateFilter) return false;
      if (payerFilter !== "all" && String(e.payer_name || "").trim() !== payerFilter) return false;
      if (owedByFilter !== "all") {
        const owed = normalizeParticipants(e.owed_by_names);
        if (!owed.includes(owedByFilter)) return false;
      }
      return true;
    });
  }, [expenses, categoryFilter, dateFilter, payerFilter, owedByFilter]);

  return (
    <div className="min-w-0 max-w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Gastos registrados</h3>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            Mostrando {filtered.length} de {expenses.length}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            aria-expanded={filtersOpen}
          >
            <Filter className="h-4 w-4" aria-hidden />
            Filtros
            <ChevronDown className={`h-4 w-4 transition ${filtersOpen ? "rotate-180" : ""}`} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => {
              setCategoryFilter("all");
              setDateFilter("all");
              setPayerFilter("all");
              setOwedByFilter("all");
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            title="Limpiar filtros"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            Limpiar
          </button>
        </div>
      </div>

      {filtersOpen ? (
        <div className="mt-4 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            <span>Categoría</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
            >
              <option value="all">Todas</option>
              {filterOptions.categories.map((c) => (
                <option key={c} value={c}>
                  {categoryLabelEs(c)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            <span>Día</span>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
            >
              <option value="all">Todos</option>
              {filterOptions.dates.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            <span>Pagador</span>
            <select
              value={payerFilter}
              onChange={(e) => setPayerFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
            >
              <option value="all">Todos</option>
              {filterOptions.payers.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-600">
            <span>Quién tiene que pagar</span>
            <select
              value={owedByFilter}
              onChange={(e) => setOwedByFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900"
            >
              <option value="all">Todos</option>
              {filterOptions.owedPeople.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      <div className="mt-4 space-y-4">
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
            No hay gastos con estos filtros.
          </div>
        ) : (
          filtered.map((expense) => {
            const currency = getCurrencyMeta(expense.currency);
            const participants = normalizeParticipants(expense.participant_names);
            const paidBy = normalizeParticipants(expense.paid_by_names);
            const owedBy = normalizeParticipants(expense.owed_by_names);

            return (
              <div key={expense.id} className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div className="min-w-0 max-w-full flex-1">
                    <div className="text-base font-semibold text-slate-900" role="heading" aria-level={4}>
                      <LongTextSheet
                        text={expense.title || "Gasto sin título"}
                        modalTitle="Gasto"
                        minLength={40}
                        lineClamp={3}
                        className="font-semibold text-slate-900"
                      />
                    </div>
                    <div className="mt-2 space-y-1 break-words text-sm text-slate-600">
                      <p>Pagador principal: {expense.payer_name || "Sin indicar"}</p>
                      <p>Viajeros implicados: {participants.length ? participants.join(", ") : "Sin viajeros"}</p>
                      <p>Han pagado: {paidBy.length ? paidBy.join(", ") : "Sin definir"}</p>
                      <p>Repartido entre: {owedBy.length ? owedBy.join(", ") : "Sin definir"}</p>
                      {expense.expense_date ? <p>Fecha: {expense.expense_date}</p> : null}
                      {expense.category ? <p>Categoría: {categoryLabelEs(expense.category)}</p> : null}
                      {expense.attachment_name ? <p>Archivo: {expense.attachment_name}</p> : null}
                    </div>
                  </div>
                  <div className="shrink-0 text-left sm:text-right">
                    <div className="text-lg font-bold text-slate-950">{currency.symbol} {Number(expense.amount || 0).toFixed(2)}</div>
                    <div className="text-xs text-slate-500">{expense.currency}</div>
                  </div>
                </div>

                {expense.notes ? (
                  <div className="mt-3 text-sm text-slate-600">
                    <LongTextSheet
                      text={expense.notes}
                      modalTitle="Notas del gasto"
                      minLength={48}
                      lineClamp={4}
                      className="text-sm text-slate-600"
                    />
                  </div>
                ) : null}

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
