export type TripExpenseBalanceInput = {
  id: string;
  title?: string | null;
  payer_name?: string | null;
  participant_names?: unknown;
  paid_by_names?: unknown;
  owed_by_names?: unknown;
  amount: number;
  currency: string;
};

export type BalanceRow = {
  person: string;
  paid: number;
  owed: number;
  net: number;
};

export type SettlementSuggestion = {
  id: string;
  debtor_name: string;
  creditor_name: string;
  amount: number;
  currency: string;
  status: "pending" | "paid";
  source_balance_key: string;
};

function normalizeNames(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export function buildBalances(expenses: TripExpenseBalanceInput[]) {
  const totals = new Map<string, { paid: number; owed: number }>();

  function touch(name: string) {
    if (!totals.has(name)) {
      totals.set(name, { paid: 0, owed: 0 });
    }
    return totals.get(name)!;
  }

  for (const expense of expenses) {
    const amount = Number(expense.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const paidBy = normalizeNames(expense.paid_by_names).length
      ? normalizeNames(expense.paid_by_names)
      : normalizeNames(expense.payer_name ? [expense.payer_name] : []);

    const owedBy = normalizeNames(expense.owed_by_names).length
      ? normalizeNames(expense.owed_by_names)
      : normalizeNames(expense.participant_names);

    if (!paidBy.length && !owedBy.length) {
      continue;
    }

    if (paidBy.length) {
      const perPayer = amount / paidBy.length;
      for (const payer of paidBy) {
        touch(payer).paid += perPayer;
      }
    }

    if (owedBy.length) {
      const perDebtor = amount / owedBy.length;
      for (const debtor of owedBy) {
        touch(debtor).owed += perDebtor;
      }
    }
  }

  const rows: BalanceRow[] = Array.from(totals.entries()).map(([person, values]) => ({
    person,
    paid: round2(values.paid),
    owed: round2(values.owed),
    net: round2(values.paid - values.owed),
  }));

  return rows.sort((a, b) => a.person.localeCompare(b.person));
}

export function buildSettlementSuggestions(
  expenses: TripExpenseBalanceInput[],
  currency: string
) {
  const balances = buildBalances(expenses);

  const debtors = balances
    .filter((row) => row.net < 0)
    .map((row) => ({ name: row.person, amount: Math.abs(row.net) }));

  const creditors = balances
    .filter((row) => row.net > 0)
    .map((row) => ({ name: row.person, amount: row.net }));

  const settlements: SettlementSuggestion[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amount = round2(Math.min(debtor.amount, creditor.amount));

    if (amount > 0) {
      settlements.push({
        id: `${debtor.name}->${creditor.name}:${amount}`,
        debtor_name: debtor.name,
        creditor_name: creditor.name,
        amount,
        currency,
        status: "pending",
        source_balance_key: `${debtor.name}->${creditor.name}`,
      });
    }

    debtor.amount = round2(debtor.amount - amount);
    creditor.amount = round2(creditor.amount - amount);

    if (debtor.amount <= 0.009) debtorIndex += 1;
    if (creditor.amount <= 0.009) creditorIndex += 1;
  }

  return settlements;
}
