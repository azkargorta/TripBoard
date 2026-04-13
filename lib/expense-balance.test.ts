import { describe, expect, it } from "vitest";
import { buildBalances, buildSettlementSuggestions, type TripExpenseBalanceInput } from "./expense-balance";

describe("buildBalances", () => {
  it("reparte pago y deuda entre participantes", () => {
    const expenses: TripExpenseBalanceInput[] = [
      {
        id: "1",
        amount: 100,
        currency: "EUR",
        paid_by_names: ["Ana"],
        owed_by_names: ["Ana", "Bea"],
      },
    ];
    const rows = buildBalances(expenses);
    const byPerson = Object.fromEntries(rows.map((r) => [r.person, r]));
    expect(byPerson.Ana.balance).toBe(50);
    expect(byPerson.Bea.balance).toBe(-50);
    expect(byPerson.Ana.paid).toBe(100);
    expect(byPerson.Bea.owed).toBe(50);
  });
  it("parsea importes en string con coma", () => {
    const rows = buildBalances([
      {
        id: "1",
        amount: "12,5",
        currency: "EUR",
        payer_name: "X",
        participant_names: ["X"],
      },
    ]);
    expect(rows.find((r) => r.person === "X")?.paid).toBe(12.5);
  });
});

describe("buildSettlementSuggestions", () => {
  it("sugiere transferencias mínimas entre deudores y acreedores", () => {
    const expenses: TripExpenseBalanceInput[] = [
      {
        id: "1",
        amount: 30,
        currency: "EUR",
        paid_by_names: ["A"],
        owed_by_names: ["A", "B", "C"],
      },
    ];
    const settlements = buildSettlementSuggestions(expenses, "EUR");
    expect(settlements.length).toBeGreaterThan(0);
    const total = settlements.reduce((s, x) => s + x.amount, 0);
    expect(total).toBeCloseTo(20, 5);
  });
});
