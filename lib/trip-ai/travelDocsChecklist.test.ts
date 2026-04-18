import { describe, expect, it } from "vitest";
import {
  parseTravelDocsChecklistFromAnswer,
  TRAVEL_DOCS_JSON_END,
  TRAVEL_DOCS_JSON_START,
} from "./travelDocsChecklist";

describe("parseTravelDocsChecklistFromAnswer", () => {
  it("parsea bloque marcado", () => {
    const answer = `Resumen breve.

${TRAVEL_DOCS_JSON_START}
{"version":1,"title":"Mi lista","intro":null,"items":[{"requirement":"Pasaporte vigente","level":"obligatorio","notes":null,"country":"UE"}]}
${TRAVEL_DOCS_JSON_END}
`;
    const p = parseTravelDocsChecklistFromAnswer(answer);
    expect(p?.title).toBe("Mi lista");
    expect(p?.items).toHaveLength(1);
    expect(p?.items[0].requirement).toBe("Pasaporte vigente");
    expect(p?.items[0].level).toBe("obligatorio");
  });

  it("devuelve null sin marcadores", () => {
    expect(parseTravelDocsChecklistFromAnswer("Solo texto")).toBeNull();
  });

  it("normaliza niveles en español", () => {
    const raw = {
      version: 1,
      title: "T",
      items: [{ requirement: "X", level: "OBLIGATORIO / verificar fuentes", notes: null, country: null }],
    };
    const answer = `${TRAVEL_DOCS_JSON_START}${JSON.stringify(raw)}${TRAVEL_DOCS_JSON_END}`;
    expect(parseTravelDocsChecklistFromAnswer(answer)?.items[0].level).toBe("obligatorio");
  });
});
