"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  buildBalances,
  buildSettlementSuggestions,
  type TripExpenseBalanceInput,
} from "@/lib/expense-balance";

export type TripSettlement = {
  id: string;
  trip_id: string;
  debtor_name: string;
  creditor_name: string;
  amount: number;
  currency: string;
  status: "pending" | "paid";
  source_balance_key?: string | null;
  paid_at?: string | null;
  notes?: string | null;
};

export type ExpenseAnalysis = {
  title?: string | null;
  category?: string | null;
  amount?: number | null;
  currency?: string | null;
  expenseDate?: string | null;
  extractedText?: string | null;
  [key: string]: unknown;
};

export type TripExpenseRecord = TripExpenseBalanceInput & {
  trip_id: string;
  category?: string | null;
  expense_date?: string | null;
  notes?: string | null;
  attachment_path?: string | null;
  attachment_name?: string | null;
  attachment_type?: string | null;
  analysis_data?: ExpenseAnalysis | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type ExpenseFormInput = {
  id?: string;
  title: string;
  category: string;
  payerName: string;
  participantNames: string[];
  paidByNames: string[];
  owedByNames: string[];
  amount: number;
  currency: string;
  expenseDate: string;
  notes: string;
  attachment?: File | null;
  keepExistingAttachment?: boolean;
  analysisData?: ExpenseAnalysis | null;
};

function normalizeNames(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeDateInput(value: string) {
  const clean = (value || "").trim();
  if (!clean) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;

  const slash = clean.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slash) {
    const [, dd, mm, yyyy] = slash;
    return `${yyyy}-${mm}-${dd}`;
  }

  const dash = clean.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dash) {
    const [, dd, mm, yyyy] = dash;
    return `${yyyy}-${mm}-${dd}`;
  }

  return clean;
}

async function withTimeout<T>(promiseLike: PromiseLike<T>, ms: number, message: string): Promise<T> {
  return await Promise.race([
    Promise.resolve(promiseLike),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}

async function apiRequest<T>(input: RequestInfo, init: RequestInit, label: string): Promise<T> {
  const response = await withTimeout(fetch(input, init), 20000, `Timeout (${label})`);
  const text = await response.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { error: text || "Respuesta no JSON." };
  }
  if (!response.ok) throw new Error(payload?.error || `Error ${response.status}`);
  if (payload?.error) throw new Error(payload.error);
  return payload as T;
}

function extractNamesFromRows(rows: Record<string, unknown>[]) {
  const names = new Set<string>();

  for (const row of rows) {
    const possible = [
      row.display_name,
      row.name,
      row.full_name,
      row.username,
      row.email,
    ];

    for (const value of possible) {
      if (typeof value === "string" && value.trim()) {
        names.add(value.trim());
        break;
      }
    }
  }

  return Array.from(names);
}

async function loadRegisteredTravelersFromKnownTables(tripId: string) {
  const attempts = [
    { table: "trip_participants", query: () => supabase.from("trip_participants").select("*").eq("trip_id", tripId) },
    { table: "trip_travelers", query: () => supabase.from("trip_travelers").select("*").eq("trip_id", tripId) },
    { table: "trip_members", query: () => supabase.from("trip_members").select("*").eq("trip_id", tripId) },
    { table: "trip_users", query: () => supabase.from("trip_users").select("*").eq("trip_id", tripId) },
  ];

  for (const attempt of attempts) {
    try {
      const response = await withTimeout(
        attempt.query(),
        10000,
        `La lectura de ${attempt.table} tardó demasiado.`
      );
      if (!response.error) {
        const names = extractNamesFromRows((response.data ?? []) as Record<string, unknown>[]);
        if (names.length) return names;
      }
    } catch {
      // seguimos con la siguiente tabla conocida
    }
  }

  return [];
}

async function fetchRate(base: string | null | undefined, target: string) {
  const safeBase = (base || target || "EUR").toUpperCase();
  if (safeBase === target) return 1;
  const url = `/api/currency/latest?base=${encodeURIComponent(safeBase)}&symbols=${encodeURIComponent(target)}`;
  const response = await fetch(url);
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || "No se pudo convertir la moneda.");
  const rate = payload?.rates?.[target];
  if (typeof rate !== "number") throw new Error(`No hay tipo de cambio para ${safeBase} → ${target}.`);
  return rate;
}

function normalizeExpenseForBalance(
  expense: TripExpenseRecord,
  currency: string,
  convertedAmount?: number
): TripExpenseBalanceInput {
  return {
    id: expense.id,
    title: expense.title,
    amount: typeof convertedAmount === "number" ? convertedAmount : Number(expense.amount || 0),
    currency,
    payer_name: expense.payer_name || "",
    participant_names: normalizeNames(expense.participant_names),
    paid_by_names: normalizeNames(expense.paid_by_names),
    owed_by_names: normalizeNames(expense.owed_by_names),
  };
}

async function uploadExpenseAttachment(tripId: string, file: File) {
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const safeName = `${crypto.randomUUID()}.${ext}`;
  const path = `${tripId}/${safeName}`;

  const { error } = await withTimeout(
    supabase.storage.from("trip-expenses").upload(path, file, {
      upsert: true,
      contentType: file.type || undefined,
    }),
    20000,
    "La subida del archivo tardó demasiado. Revisa bucket, RLS o conexión."
  );

  if (error) {
    const text = error.message || "No se pudo subir el archivo adjunto.";
    if (text.toLowerCase().includes("bucket")) {
      throw new Error("No existe el bucket trip-expenses o no tiene permisos.");
    }
    if (text.toLowerCase().includes("row-level security")) {
      throw new Error("Supabase bloquea la subida del archivo por RLS.");
    }
    throw new Error(text);
  }

  return { path, name: file.name, type: file.type || "application/octet-stream" };
}

export function useTripExpenses(tripId: string) {
  const [expenses, setExpenses] = useState<TripExpenseRecord[]>([]);
  const [settlements, setSettlements] = useState<TripSettlement[]>([]);
  const [registeredTravelers, setRegisteredTravelers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balanceCurrency, setBalanceCurrency] = useState("EUR");
  const [balances, setBalances] = useState<any[]>([]);
  const [suggestedSettlements, setSuggestedSettlements] = useState<any[]>([]);

  const load = useCallback(async () => {
    if (!tripId) {
      setExpenses([]);
      setSettlements([]);
      setRegisteredTravelers([]);
      setError(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const payload = await apiRequest<{
        expenses: TripExpenseRecord[];
        settlements: TripSettlement[];
        registeredTravelers: string[];
      }>(`/api/trip-expenses?tripId=${encodeURIComponent(tripId)}`, { method: "GET" }, "cargar gastos");

      setExpenses(Array.isArray(payload.expenses) ? payload.expenses : []);
      setSettlements(Array.isArray(payload.settlements) ? payload.settlements : []);
      setRegisteredTravelers(Array.isArray(payload.registeredTravelers) ? payload.registeredTravelers : []);
    } catch (err) {
      console.error("Error cargando gastos:", err);
      setExpenses([]);
      setSettlements([]);
      setRegisteredTravelers([]);
      setError(
        err instanceof Error ? err.message : "No se pudieron cargar los gastos."
      );
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    void load();
  }, [load]);

  const participants = useMemo(() => {
    const names = new Set<string>();
    registeredTravelers.forEach((name) => names.add(name));
    expenses.forEach((expense) => {
      if (expense.payer_name) names.add(expense.payer_name);
      normalizeNames(expense.participant_names).forEach((name) => names.add(name));
      normalizeNames(expense.paid_by_names).forEach((name) => names.add(name));
      normalizeNames(expense.owed_by_names).forEach((name) => names.add(name));
    });
    settlements.forEach((settlement) => {
      if (settlement.debtor_name) names.add(settlement.debtor_name);
      if (settlement.creditor_name) names.add(settlement.creditor_name);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [expenses, registeredTravelers, settlements]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const convertedExpenses: TripExpenseBalanceInput[] = [];
        for (const expense of expenses) {
          const rate = await fetchRate(expense.currency, balanceCurrency);
          const convertedAmount = Math.round(Number(expense.amount || 0) * rate * 100) / 100;
          convertedExpenses.push(normalizeExpenseForBalance(expense, balanceCurrency, convertedAmount));
        }

        if (cancelled) return;

        setBalances(buildBalances(convertedExpenses));

        const suggestions = buildSettlementSuggestions(convertedExpenses, balanceCurrency);
        const existingByKey = new Map(
          settlements.map((item) => [item.source_balance_key || `${item.debtor_name}->${item.creditor_name}`, item])
        );

        setSuggestedSettlements(
          suggestions.map((suggestion) => {
            const existing = existingByKey.get(suggestion.source_balance_key);
            return existing ? { ...suggestion, id: existing.id, status: existing.status } : suggestion;
          })
        );
      } catch (err) {
        if (!cancelled) {
          console.error("Error recalculando balance:", err);
          setError(err instanceof Error ? err.message : "No se pudo recalcular el balance.");
          setBalances([]);
          setSuggestedSettlements([]);
        }
      }
    }

    if (expenses.length) void run();
    else {
      setBalances([]);
      setSuggestedSettlements([]);
    }

    return () => {
      cancelled = true;
    };
  }, [balanceCurrency, expenses, settlements]);

  const createExpense = useCallback(async (input: ExpenseFormInput) => {
    setSaving(true);
    setError(null);
    try {
      let attachment = null as null | { path: string; name: string; type: string };
      if (input.attachment) attachment = await uploadExpenseAttachment(tripId, input.attachment);

      const payload = {
        tripId,
        title: input.title.trim(),
        category: input.category || "general",
        payer_name: input.payerName.trim() || null,
        participant_names: input.participantNames,
        paid_by_names: input.paidByNames,
        owed_by_names: input.owedByNames,
        amount: input.amount,
        currency: input.currency,
        expense_date: normalizeDateInput(input.expenseDate),
        notes: input.notes || null,
        attachment_path: attachment?.path || null,
        attachment_name: attachment?.name || null,
        attachment_type: attachment?.type || null,
        analysis_data: input.analysisData || {},
      };

      await apiRequest<{ expense: TripExpenseRecord }>(
        "/api/trip-expenses",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
        "crear gasto"
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el gasto.");
      throw err;
    } finally {
      setSaving(false);
    }
  }, [load, tripId]);

  const updateExpense = useCallback(async (expenseId: string, input: ExpenseFormInput, currentExpense?: TripExpenseRecord | null) => {
    setSaving(true);
    setError(null);
    try {
      let attachment = {
        path: currentExpense?.attachment_path || null,
        name: currentExpense?.attachment_name || null,
        type: currentExpense?.attachment_type || null,
      };

      if (input.attachment) attachment = await uploadExpenseAttachment(tripId, input.attachment);
      else if (!input.keepExistingAttachment) attachment = { path: null, name: null, type: null };

      const payload = {
        title: input.title.trim(),
        category: input.category || "general",
        payer_name: input.payerName.trim() || null,
        participant_names: input.participantNames,
        paid_by_names: input.paidByNames,
        owed_by_names: input.owedByNames,
        amount: input.amount,
        currency: input.currency,
        expense_date: normalizeDateInput(input.expenseDate),
        notes: input.notes || null,
        attachment_path: attachment.path,
        attachment_name: attachment.name,
        attachment_type: attachment.type,
        analysis_data: input.analysisData || currentExpense?.analysis_data || {},
      };

      await apiRequest<{ expense: TripExpenseRecord }>(
        `/api/trip-expenses/${expenseId}`,
        { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
        "actualizar gasto"
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar el gasto.");
      throw err;
    } finally {
      setSaving(false);
    }
  }, [load, tripId]);

  const deleteExpense = useCallback(async (expenseId: string) => {
    setSaving(true);
    setError(null);
    try {
      await apiRequest<{ ok: true }>(`/api/trip-expenses/${expenseId}`, { method: "DELETE" }, "eliminar gasto");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar el gasto.");
      throw err;
    } finally {
      setSaving(false);
    }
  }, [load]);

  const toggleSettlementStatus = useCallback(async (settlement: any) => {
    setSaving(true);
    setError(null);
    try {
      await apiRequest<{ ok: true; status: string }>(
        "/api/trip-expense-settlements",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tripId, settlement }) },
        "toggle settlement"
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar el estado del pago.");
      throw err;
    } finally {
      setSaving(false);
    }
  }, [load, tripId]);

  async function convertAmount(amount: number, from: string, to: string) {
    const rate = await fetchRate(from, to);
    return Math.round(amount * rate * 100) / 100;
  }

  function createWhatsAppLink(settlement: any) {
    const message = `Hola. Según el balance del viaje, ${settlement.debtor_name} debe pagar ${settlement.amount.toFixed(2)} ${settlement.currency} a ${settlement.creditor_name}. Estado: ${settlement.status === "paid" ? "pagado" : "pendiente"}.`;
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  }

  return {
    expenses,
    settlements,
    registeredTravelers,
    participants,
    balances,
    suggestedSettlements,
    balanceCurrency,
    setBalanceCurrency,
    loading,
    saving,
    error,
    reload: load,
    createExpense,
    updateExpense,
    deleteExpense,
    toggleSettlementStatus,
    convertAmount,
    createWhatsAppLink,
  };
}
