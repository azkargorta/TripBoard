import { afterEach, describe, expect, it, vi } from "vitest";
import { estimateGemini25FlashCostEur, getMonthlyAiBudgetEur, monthKeyUtc } from "./ai-usage";

describe("monthKeyUtc", () => {
  it("formatea año-mes en UTC", () => {
    const d = new Date(Date.UTC(2026, 0, 15));
    expect(monthKeyUtc(d)).toBe("2026-01");
  });
});

describe("getMonthlyAiBudgetEur", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  it("usa env si es número positivo", () => {
    vi.stubEnv("AI_USER_MONTHLY_BUDGET_EUR", "12.5");
    expect(getMonthlyAiBudgetEur()).toBe(12.5);
  });
  it("usa 9 por defecto si falta o es inválido", () => {
    vi.stubEnv("AI_USER_MONTHLY_BUDGET_EUR", "");
    expect(getMonthlyAiBudgetEur()).toBe(9);
    vi.stubEnv("AI_USER_MONTHLY_BUDGET_EUR", "-1");
    expect(getMonthlyAiBudgetEur()).toBe(9);
  });
});

describe("estimateGemini25FlashCostEur", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });
  it("calcula coste con valores por defecto", () => {
    const cost = estimateGemini25FlashCostEur({ inputTokens: 1_000_000, outputTokens: 1_000_000 });
    expect(cost).toBeCloseTo(0.260145 + 2.167875, 6);
  });
  it("respeta variables de entorno de precio", () => {
    vi.stubEnv("GEMINI_FLASH_INPUT_EUR_PER_M_TOKENS", "1");
    vi.stubEnv("GEMINI_FLASH_OUTPUT_EUR_PER_M_TOKENS", "2");
    expect(estimateGemini25FlashCostEur({ inputTokens: 2_000_000, outputTokens: 500_000 })).toBe(2 + 1);
  });
});
