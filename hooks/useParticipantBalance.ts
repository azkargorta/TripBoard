"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

export type ParticipantBalanceSummary = {
  participantId: string;
  paid: number;
  owed: number;
  net: number;
};

type ExpenseRow = {
  id: string;
  amount: number | string | null;
  amount_in_base?: number | string | null;
  paid_by_participant_id: string | null;
  split_between: unknown;
};

export function useParticipantBalances(tripId: string | undefined) {
  const [rows, setRows] = useState<Record<string, ParticipantBalanceSummary>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!tripId) {
        setRows({});
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("trip_expenses")
        .select("id, amount, amount_in_base, paid_by_participant_id, split_between")
        .eq("trip_id", tripId);

      if (cancelled) return;

      if (error) {
        setRows({});
        setError(error.message);
        setLoading(false);
        return;
      }

      const next: Record<string, ParticipantBalanceSummary> = {};

      for (const expense of (data ?? []) as ExpenseRow[]) {
        const amount = toAmount(expense.amount_in_base ?? expense.amount);
        if (amount <= 0) continue;

        const splitBetween = normalizeSplitBetween(expense.split_between);

        if (expense.paid_by_participant_id) {
          const current =
            next[expense.paid_by_participant_id] ??
            emptyBalance(expense.paid_by_participant_id);
          current.paid += amount;
          current.net += amount;
          next[expense.paid_by_participant_id] = current;
        }

        if (splitBetween.length > 0) {
          const share = amount / splitBetween.length;
          for (const participantId of splitBetween) {
            const current = next[participantId] ?? emptyBalance(participantId);
            current.owed += share;
            current.net -= share;
            next[participantId] = current;
          }
        }
      }

      setRows(next);
      setLoading(false);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [tripId]);

  return useMemo(
    () => ({
      balancesByParticipantId: rows,
      loading,
      error,
    }),
    [rows, loading, error]
  );
}

function emptyBalance(participantId: string): ParticipantBalanceSummary {
  return {
    participantId,
    paid: 0,
    owed: 0,
    net: 0,
  };
}

function toAmount(value: string | number | null | undefined) {
  const numeric = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeSplitBetween(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.length > 0);
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === "string" && item.length > 0);
      }
    } catch {
      return [];
    }
  }

  return [];
}
