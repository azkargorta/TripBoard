export type TripExpenseBalanceInput = {
  id: string;
  title?: string | null;
  payer_name?: string | null;
  participant_names?: unknown;
  paid_by_names?: unknown;
  owed_by_names?: unknown;
  amount: number | string | null;
  currency: string | null;
};

export type BalanceRow = {
  person: string;
  balance: number;
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

function normalizeAmount(value: number | string | null) {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = parseFloat(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeCurrency(value: string | null | undefined) {
  const code = (value || "EUR").toUpperCase().trim();
  return /^[A-Z]{3}$/.test(code) ? code : "EUR";
}

function normalizeNames(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean);
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

export function buildBalances(expenses: TripExpenseBalanceInput[]) {
  const map = new Map<string, number>();

  for (const e of expenses) {
    const amount = normalizeAmount(e.amount);
    const participants = normalizeNames(e.participant_names);
    const paidBy = normalizeNames(e.paid_by_names);
    const owedBy = normalizeNames(e.owed_by_names);

    const debtors = owedBy.length ? owedBy : participants;
    const payers = paidBy.length ? paidBy : (e.payer_name ? [e.payer_name] : []);

    if (!debtors.length && !payers.length) continue;

    if (debtors.length) {
      const split = amount / debtors.length;
      for (const debtor of debtors) {
        map.set(debtor, (map.get(debtor) || 0) - split);
      }
    }

    if (payers.length) {
      const split = amount / payers.length;
      for (const payer of payers) {
        map.set(payer, (map.get(payer) || 0) + split);
      }
    }
  }

  return Array.from(map.entries())
    .map(([person, balance]) => ({
      person,
      balance: round2(balance),
    }))
    .sort((a, b) => a.person.localeCompare(b.person));
}

export function buildSettlementSuggestions(
  expensesOrBalances: TripExpenseBalanceInput[] | BalanceRow[],
  currency: string = "EUR"
): SettlementSuggestion[] {
  const balances: BalanceRow[] =
    expensesOrBalances.length > 0 && "person" in (expensesOrBalances[0] as any)
      ? (expensesOrBalances as BalanceRow[])
      : buildBalances(expensesOrBalances as TripExpenseBalanceInput[]);

  const debtors = balances
    .filter((row) => row.balance < 0)
    .map((row) => ({ name: row.person, amount: Math.abs(row.balance) }));

  const creditors = balances
    .filter((row) => row.balance > 0)
    .map((row) => ({ name: row.person, amount: row.balance }));

  const settlements: SettlementSuggestion[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;
  const safeCurrency = normalizeCurrency(currency);

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
        currency: safeCurrency,
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
