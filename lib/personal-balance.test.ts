import { describe, expect, it } from "vitest";
import { computePersonalBalance } from "./personal-balance";

describe("computePersonalBalance", () => {
  it("empareja por nombre normalizado", () => {
    const r = computePersonalBalance({
      currentParticipant: { display_name: "Ana López" },
      expenses: [
        {
          id: "e1",
          amount: 60,
          currency: "EUR",
          paid_by_names: ["Ana López"],
          owed_by_names: ["Ana López", "Bea"],
        },
      ],
      participants: [{ display_name: "Ana López", id: "p1" }],
    });
    expect(r.matchedBy).not.toBe("none");
    expect(r.paid).toBeGreaterThan(0);
    expect(typeof r.net).toBe("number");
  });
  it("sin gastos devuelve ceros", () => {
    const r = computePersonalBalance({
      currentParticipant: { username: "solo" },
      expenses: [],
      participants: [],
    });
    expect(r.paid).toBe(0);
    expect(r.owed).toBe(0);
    expect(r.net).toBe(0);
  });
});
