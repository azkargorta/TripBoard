
export type TripExpenseBalanceInput = {
  id: string;
  title?: string | null;
  payer_name?: string | null;
  participant_names?: unknown;
  paid_by_names?: unknown;
  owed_by_names?: unknown;
  amount: number | string | null;
  currency: string;
};

function normalizeAmount(value: number | string | null) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return parseFloat(value.replace(",", "."));
  return 0;
}

function normalizeNames(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

export function buildBalances(expenses: TripExpenseBalanceInput[]) {
  const map = new Map<string, number>();

  for (const e of expenses) {
    const amount = normalizeAmount(e.amount);
    const people = normalizeNames(e.participant_names);

    if (!people.length) continue;

    const split = amount / people.length;

    for (const p of people) {
      map.set(p, (map.get(p) || 0) - split);
    }

    const payer = e.payer_name;
    if (payer) {
      map.set(payer, (map.get(payer) || 0) + amount);
    }
  }

  return Array.from(map.entries()).map(([person, balance]) => ({
    person,
    balance,
  }));
}
