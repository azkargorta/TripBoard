import { describe, expect, it } from "vitest";
import { isValidEmail, isValidPassword, isValidUsername, normalizeUsername } from "./auth";

describe("normalizeUsername", () => {
  it("recorta y pasa a minúsculas", () => {
    expect(normalizeUsername("  Ana_Maria  ")).toBe("ana_maria");
  });
});

describe("isValidUsername", () => {
  it("acepta 3–20 caracteres alfanuméricos y guión bajo", () => {
    expect(isValidUsername("ab")).toBe(false);
    expect(isValidUsername("abc")).toBe(true);
    expect(isValidUsername("user_01")).toBe(true);
    expect(isValidUsername("a".repeat(20))).toBe(true);
    expect(isValidUsername("a".repeat(21))).toBe(false);
  });
  it("rechaza mayúsculas y caracteres especiales", () => {
    expect(isValidUsername("User")).toBe(false);
    expect(isValidUsername("user-name")).toBe(false);
  });
});

describe("isValidEmail", () => {
  it("valida formato básico", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("bad")).toBe(false);
    expect(isValidEmail("@nodomain.com")).toBe(false);
    expect(isValidEmail("spaces in@mail.com")).toBe(false);
  });
});

describe("isValidPassword", () => {
  it("exige al menos 8 caracteres", () => {
    expect(isValidPassword("1234567")).toBe(false);
    expect(isValidPassword("12345678")).toBe(true);
  });
});
