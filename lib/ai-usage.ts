export type AiUsage = {
  inputTokens: number;
  outputTokens: number;
};

export function monthKeyUtc(d: Date = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function getMonthlyAiBudgetEur(): number {
  const env = asNumber(process.env.AI_USER_MONTHLY_BUDGET_EUR);
  // 9€ es razonable como “cap” de seguridad para un MVP; ajustable por env.
  return env != null && env > 0 ? env : 9;
}

export function estimateGemini25FlashCostEur(usage: AiUsage): number {
  // Basado en tu CSV de precios:
  // - Input: 0.260145 € / 1,000,000 tokens
  // - Output: 2.167875 € / 1,000,000 tokens
  const inputPerM = asNumber(process.env.GEMINI_FLASH_INPUT_EUR_PER_M_TOKENS) ?? 0.260145;
  const outputPerM = asNumber(process.env.GEMINI_FLASH_OUTPUT_EUR_PER_M_TOKENS) ?? 2.167875;
  const cost = (usage.inputTokens / 1_000_000) * inputPerM + (usage.outputTokens / 1_000_000) * outputPerM;
  // evitar NaN
  return Number.isFinite(cost) ? cost : 0;
}

