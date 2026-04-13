import { describe, expect, it } from "vitest";
import { ALL_CURRENCIES, getCurrencyMeta } from "./currencies";

describe("getCurrencyMeta", () => {
  it("devuelve metadatos para código conocido", () => {
    const eur = getCurrencyMeta("EUR");
    expect(eur.code).toBe("EUR");
    expect(eur.symbol).toBe("€");
  });
  it("es case-sensitive: desconocido devuelve fallback", () => {
    const x = getCurrencyMeta("eur");
    expect(x.code).toBe("eur");
    expect(x.name).toBe("eur");
  });
  it("ALL_CURRENCIES tiene códigos únicos", () => {
    const codes = ALL_CURRENCIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
