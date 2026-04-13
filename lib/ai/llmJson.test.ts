import { describe, expect, it } from "vitest";
import { extractFirstJsonObject } from "./llmJson";

describe("extractFirstJsonObject", () => {
  it("extrae el primer objeto JSON válido del texto", () => {
    const text = 'Razonamiento...\n{"a":1,"b":[2]}\nfin';
    expect(extractFirstJsonObject(text)).toEqual({ a: 1, b: [2] });
  });
  it("devuelve null si no hay objeto o el JSON es inválido", () => {
    expect(extractFirstJsonObject("sin llaves")).toBeNull();
    expect(extractFirstJsonObject('{"broken":')).toBeNull();
    expect(extractFirstJsonObject("" as unknown as string)).toBeNull();
  });
});
