"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { buildBalances, convertExpensesToCurrency, suggestSettlements } from "@/lib/expense-balance";

export type TripExpenseRecord = {
  id: string;
  trip_id: string;
  title: string;
  amount: number;
  currency: string;
  expense_date: string | null;
  category: string | null;
  notes: string | null;
  paid_by: string | null;
  split_between: string[] | null;
  status: "paid" | "pending";
  receipt_url: string | null;
  created_at: string;
};

export type TripSettlement = {
  id: string;
  trip_id: string;
  from_user: string;
  to_user: string;
  amount: number;
  currency: string;
  status: "paid" | "pending";
  created_at: string;
};

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

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [expensesResponse, settlementsResponse] = await Promise.all([
        supabase
          .from("trip_expenses")
          .select("*")
          .eq("trip_id", tripId)
          .order("expense_date", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase
          .from("trip_expense_settlements")
          .select("*")
          .eq("trip_id", tripId)
          .order("created_at", { ascending: false }),
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

  useEffect(() => {
    void load();
  }, [load]);

  const balances = useMemo(() => {
    const converted = convertExpensesToCurrency(expenses as any[], balanceCurrency);
    return buildBalances(converted);
  }, [expenses, balanceCurrency]);

  const suggestedSettlements = useMemo(() => suggestSettlements(balances), [balances]);

  return {
    expenses,
    settlements,
    registeredTravelers,
    loading,
    saving,
    error,
    balanceCurrency,
    setBalanceCurrency,
    balances,
    suggestedSettlements,
    reload: load,
  };
}
