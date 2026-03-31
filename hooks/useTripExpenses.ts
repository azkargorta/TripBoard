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

async function withTimeout<T>(promiseLike: PromiseLike<T>, ms: number, message: string): Promise<T> {
  return await Promise.race([
    Promise.resolve(promiseLike),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
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
      throw new Error("No existe el bucket trip-expenses o no tiene permisos. Ejecuta el SQL del parche de storage.");
    }
    if (text.toLowerCase().includes("row-level security")) {
      throw new Error("Supabase bloquea la subida del archivo por RLS. Ejecuta el SQL del parche de storage.");
    }
    throw new Error(text);
  }

  return { path, name: file.name, type: file.type || "application/octet-stream" };
}

function normalizeExpenseForBalance(expense: any, currency: string, amount: number): TripExpenseBalanceInput {
  const fallbackParticipants = normalizeNames(expense.participant_names);
  const paidBy = normalizeNames(expense.paid_by_names).length
    ? normalizeNames(expense.paid_by_names)
    : expense.payer_name
    ? [expense.payer_name]
    : [];
  const owedBy = normalizeNames(expense.owed_by_names).length
    ? normalizeNames(expense.owed_by_names)
    : fallbackParticipants;

  return {
    id: expense.id,
    title: expense.title,
    payer_name: expense.payer_name || paidBy[0] || null,
    participant_names: fallbackParticipants,
    paid_by_names: paidBy,
    owed_by_names: owedBy,
    amount,
    currency,
  };
}

function extractNamesFromRows(rows: any[]) {
  const candidates = ["name", "full_name", "participant_name", "traveler_name", "display_name"];
  const results = new Set<string>();

  for (const row of rows || []) {
    for (const key of candidates) {
      const value = typeof row?.[key] === "string" ? row[key].trim() : "";
      if (value) results.add(value);
    }

    if (row?.profile && typeof row.profile === "object") {
      for (const key of candidates) {
        const value = typeof row.profile?.[key] === "string" ? row.profile[key].trim() : "";
        if (value) results.add(value);
      }
    }
  }

  return Array.from(results).sort((a, b) => a.localeCompare(b));
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
      const response = await attempt.query();
      if (!response.error) {
        const names = extractNamesFromRows(response.data || []);
        if (names.length) {
          return names;
        }
      }
    } catch {
      // tabla no existente o inaccesible: seguimos con la siguiente
    }
  }

  return [];
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
    try {
      setLoading(true);
      setError(null);

      const [expensesResponse, settlementsResponse] = await Promise.all([
        supabase.from("trip_expenses").select("*").eq("trip_id", tripId).order("expense_date", { ascending: false }).order("created_at", { ascending: false }),
        supabase.from("trip_expense_settlements").select("*").eq("trip_id", tripId).order("created_at", { ascending: false }),
      ]);

      if (expensesResponse.error) throw new Error(expensesResponse.error.message);
      if (settlementsResponse.error) throw new Error(settlementsResponse.error.message);

      setExpenses((expensesResponse.data || []) as TripExpenseRecord[]);
      setSettlements((settlementsResponse.data || []) as TripSettlement[]);

      const travelers = await loadRegisteredTravelersFromKnownTables(tripId);
      setRegisteredTravelers(travelers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los gastos.");
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => { load(); }, [load]);

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
        if (!cancelled) setError(err instanceof Error ? err.message : "No se pudo recalcular el balance.");
      }
    }

    if (expenses.length) run();
    else {
      setBalances([]);
      setSuggestedSettlements([]);
    }

    return () => { cancelled = true; };
  }, [balanceCurrency, expenses, settlements]);

  const createExpense = useCallback(async (input: ExpenseFormInput) => {
    setSaving(true);
    setError(null);
    try {
      let attachment = null as null | { path: string; name: string; type: string };
      if (input.attachment) attachment = await uploadExpenseAttachment(tripId, input.attachment);

      const payload = {
        trip_id: tripId,
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

      const expenseInsertResult = await withTimeout(
        supabase.from("trip_expenses").insert(payload),
        15000,
        "El guardado del gasto tardó demasiado. Revisa la tabla trip_expenses o triggers."
      );
      if (expenseInsertResult.error) throw new Error(expenseInsertResult.error.message);
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

      const expenseUpdateResult = await withTimeout(
        supabase.from("trip_expenses").update(payload).eq("id", expenseId),
        15000,
        "El guardado del gasto tardó demasiado. Revisa la tabla trip_expenses o triggers."
      );
      if (expenseUpdateResult.error) throw new Error(expenseUpdateResult.error.message);
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
      const { error } = await supabase.from("trip_expenses").delete().eq("id", expenseId);
      if (error) throw new Error(error.message);
      await load();
    } finally {
      setSaving(false);
    }
  }, [load]);

  const toggleSettlementStatus = useCallback(async (settlement: any) => {
    setSaving(true);
    setError(null);
    try {
      const newStatus = settlement.status === "paid" ? "pending" : "paid";
      if (settlement.id && !String(settlement.id).includes("->")) {
        const { error } = await supabase.from("trip_expense_settlements").update({
          status: newStatus,
          paid_at: newStatus === "paid" ? new Date().toISOString() : null,
        }).eq("id", settlement.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("trip_expense_settlements").insert({
          trip_id: tripId,
          debtor_name: settlement.debtor_name,
          creditor_name: settlement.creditor_name,
          amount: settlement.amount,
          currency: settlement.currency,
          status: newStatus,
          source_balance_key: settlement.source_balance_key,
          paid_at: newStatus === "paid" ? new Date().toISOString() : null,
        });
        if (error) throw new Error(error.message);
      }
      await load();
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
