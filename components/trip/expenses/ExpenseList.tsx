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

// G3 — Semantic colors per category
const CAT_META: Record<string, { label: string; bg: string; text: string; icon: string }> = {
  transport:     { label: "Transporte",   bg: "bg-blue-100",   text: "text-blue-800",   icon: "🚌" },
  transportation:{ label: "Transporte",   bg: "bg-blue-100",   text: "text-blue-800",   icon: "🚌" },
  lodging:       { label: "Alojamiento",  bg: "bg-violet-100", text: "text-violet-800", icon: "🏨" },
  accommodation: { label: "Alojamiento",  bg: "bg-violet-100", text: "text-violet-800", icon: "🏨" },
  food:          { label: "Comida",       bg: "bg-orange-100", text: "text-orange-800", icon: "🍽️" },
  meals:         { label: "Comida",       bg: "bg-orange-100", text: "text-orange-800", icon: "🍽️" },
  restaurant:    { label: "Restaurante",  bg: "bg-orange-100", text: "text-orange-800", icon: "🍽️" },
  groceries:     { label: "Supermercado", bg: "bg-amber-100",  text: "text-amber-800",  icon: "🛒" },
  supermarket:   { label: "Supermercado", bg: "bg-amber-100",  text: "text-amber-800",  icon: "🛒" },
  activities:    { label: "Actividades",  bg: "bg-emerald-100",text: "text-emerald-800",icon: "🎟️" },
  activity:      { label: "Actividades",  bg: "bg-emerald-100",text: "text-emerald-800",icon: "🎟️" },
  tickets:       { label: "Tickets",      bg: "bg-emerald-100",text: "text-emerald-800",icon: "🎟️" },
  ticket:        { label: "Tickets",      bg: "bg-emerald-100",text: "text-emerald-800",icon: "🎟️" },
  shopping:      { label: "Compras",      bg: "bg-pink-100",   text: "text-pink-800",   icon: "🛍️" },
  misc:          { label: "Otros",        bg: "bg-slate-100",  text: "text-slate-700",  icon: "📌" },
  other:         { label: "Otros",        bg: "bg-slate-100",  text: "text-slate-700",  icon: "📌" },
  others:        { label: "Otros",        bg: "bg-slate-100",  text: "text-slate-700",  icon: "📌" },
};
function categoryMeta(raw: string | null | undefined) {
  const k = String(raw || "").trim().toLowerCase();
  const found = CAT_META[k];
  if (found) return found;
  const label = k ? k.replace(/_/g, " ").replace(/\w/g, (m) => m.toUpperCase()) : "Sin categoría";
  return { label, bg: "bg-slate-100", text: "text-slate-700", icon: "📌" };
}
function categoryLabelEs(raw: string | null | undefined): string {
  return categoryMeta(raw).label;
}

// G2 — Avatar initials with deterministic color
const AVATAR_COLORS = [
  "bg-violet-200 text-violet-900", "bg-blue-200 text-blue-900",
  "bg-emerald-200 text-emerald-900", "bg-amber-200 text-amber-900",
  "bg-pink-200 text-pink-900", "bg-orange-200 text-orange-900",
  "bg-sky-200 text-sky-900", "bg-indigo-200 text-indigo-900",
];
function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]!;
}
function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("es-ES", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
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
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm">💸</div>
              <p className="text-sm font-extrabold text-slate-800">Sin gastos</p>
              <p className="mt-1 text-xs text-slate-500">
                {categoryFilter !== "all" || dateFilter !== "all" || payerFilter !== "all" || owedByFilter !== "all"
                  ? "Prueba a quitar los filtros."
                  : "Registra el primer gasto para ver el balance del grupo."}
              </p>
            </div>
        ) : (
          filtered.map((expense) => {
            const currency = getCurrencyMeta(expense.currency);
            const participants = normalizeParticipants(expense.participant_names);
            const paidBy = normalizeParticipants(expense.paid_by_names);
            const owedBy = normalizeParticipants(expense.owed_by_names);

            return (
              <div key={expense.id} className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md hover:border-slate-300">
                {/* G2+G3 — Row: avatar + content + amount */}
                <div className="flex items-start gap-3 px-4 py-3.5">
                  {/* G2 — Payer avatar */}
                  {expense.payer_name ? (
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-extrabold mt-0.5 ${avatarColor(expense.payer_name)}`}>
                      {initials(expense.payer_name)}
                    </div>
                  ) : (
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-400 text-xs mt-0.5">?</div>
                  )}

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {/* Title row + category chip */}
                    <div className="flex items-start gap-2 flex-wrap">
                      <div className="flex-1 min-w-0 text-sm font-semibold text-slate-900 leading-snug">
                        <LongTextSheet text={expense.title || "Gasto sin título"} modalTitle="Gasto" minLength={40} lineClamp={2} className="font-semibold text-slate-900" />
                      </div>
                      {/* G3 — Category chip with color */}
                      {expense.category && (() => {
                        const cat = categoryMeta(expense.category);
                        return (
                          <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${cat.bg} ${cat.text}`}>
                            <span>{cat.icon}</span>{cat.label}
                          </span>
                        );
                      })()}
                    </div>

                    {/* Meta row */}
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                      {expense.payer_name && <span>Pagado por <span className="font-semibold text-slate-700">{expense.payer_name}</span></span>}
                      {owedBy.length > 0 && <span>Entre {owedBy.length} persona{owedBy.length !== 1 ? "s" : ""}</span>}
                      {expense.expense_date && <span>{expense.expense_date}</span>}
                    </div>
                    {expense.notes ? (
                      <p className="mt-1.5 text-xs text-slate-400 line-clamp-1">{expense.notes}</p>
                    ) : null}
                  </div>

                  {/* G1 — Amount right-aligned, prominent */}
                  <div className="shrink-0 text-right ml-2">
                    <div className="text-base font-extrabold text-slate-950 tabular-nums">
                      {formatMoney(Number(expense.amount || 0), expense.currency)}
                    </div>
                    {expense.attachment_name && <p className="mt-0.5 text-[10px] text-slate-400">📎</p>}
                  </div>
                </div>

                {/* Actions row */}
                <div className="border-t border-slate-100 px-4 py-2 flex gap-1.5">
                  <button type="button" onClick={() => onEdit(expense)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition">Editar</button>
                  <button type="button" onClick={() => onDuplicate(expense)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition">Duplicar</button>
                  <button type="button" onClick={() => onDelete(expense.id)} className="ml-auto rounded-lg border border-red-100 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 transition">Eliminar</button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
