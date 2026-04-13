import { describe, expect, it } from "vitest";
import {
  cleanLineValue,
  detectCurrency,
  extractFirstDateFromText,
  normalizeSpaces,
  pickAllDates,
  pickBestAmount,
  pickFirst,
  pickFirstTime,
  pickHotelStayDate,
  splitCityCountry,
} from "./helpers";

describe("normalizeSpaces / cleanLineValue", () => {
  it("colapsa espacios y recorta", () => {
    expect(normalizeSpaces("  a \n\t b  ")).toBe("a b");
  });
  it("cleanLineValue limpia bordes", () => {
    expect(cleanLineValue("  : .hola. : ")).toBe("hola");
    expect(cleanLineValue(null)).toBeNull();
  });
});

describe("pickFirst", () => {
  it("devuelve el primer grupo que limpia a no vacío", () => {
    expect(pickFirst("x:  valor  ", [/foo:(.+)/, /x:\s*(.+)/])).toBe("valor");
  });
});

describe("fechas", () => {
  it("pickAllDates recoge ISO y DMY", () => {
    const t = "Desde 2026-03-01 y 15/04/2026";
    expect(pickAllDates(t).sort()).toEqual(["2026-03-01", "2026-04-15"].sort());
  });
  it("extractFirstDateFromText", () => {
    expect(extractFirstDateFromText("Reserva 31/12/2025")).toBe("2025-12-31");
    expect(extractFirstDateFromText(null)).toBeNull();
  });
  it("pickHotelStayDate checkin", () => {
    const text = "Check-in: 2026-06-10\nCheck-out: 2026-06-12";
    expect(pickHotelStayDate(text, "checkin")).toBe("2026-06-10");
    expect(pickHotelStayDate(text, "checkout")).toBe("2026-06-12");
  });
});

describe("pickFirstTime", () => {
  it("normaliza hora HH:mm", () => {
    expect(pickFirstTime("Sale a las 9:05", [/(\d{1,2}:\d{2})/])).toBe("09:05");
  });
});

describe("detectCurrency", () => {
  it("detecta por símbolo o código", () => {
    expect(detectCurrency("Total 100 €")).toBe("EUR");
    expect(detectCurrency("USD 50")).toBe("USD");
    expect(detectCurrency("solo números")).toBeNull();
  });
});

describe("pickBestAmount", () => {
  it("prioriza líneas con total", () => {
    const text = "Subtotal 10,00 EUR\nGrand total 123,45 EUR";
    expect(pickBestAmount(text)).toBe(123.45);
  });
});

describe("splitCityCountry", () => {
  it("toma penúltimo y último tramo", () => {
    expect(splitCityCountry("Calle 1, Madrid, España")).toEqual({ city: "Madrid", country: "España" });
    expect(splitCityCountry(null)).toEqual({ city: null, country: null });
  });
});
