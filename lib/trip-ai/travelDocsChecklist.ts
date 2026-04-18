/**
 * Checklist de documentos / trámites emitida por el asistente (modo travel_docs).
 * El modelo incluye JSON entre marcadores TRIPBOARD_TRAVEL_DOCS_JSON_* para UI y listas.
 */

export type TravelDocsChecklistLevel = "obligatorio" | "recomendado" | "verificar";

export type TravelDocsChecklistItem = {
  requirement: string;
  level: TravelDocsChecklistLevel;
  notes: string | null;
  country: string | null;
};

export type TravelDocsChecklistPayload = {
  version: 1;
  title: string;
  intro: string | null;
  items: TravelDocsChecklistItem[];
};

export const TRAVEL_DOCS_JSON_START = "TRIPBOARD_TRAVEL_DOCS_JSON_START";
export const TRAVEL_DOCS_JSON_END = "TRIPBOARD_TRAVEL_DOCS_JSON_END";

function normalizeLevel(raw: unknown): TravelDocsChecklistLevel {
  const s = String(raw ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  if (s.includes("oblig")) return "obligatorio";
  if (s.includes("recom")) return "recomendado";
  if (s.includes("verif")) return "verificar";
  if (s.includes("opcional")) return "recomendado";
  return "verificar";
}

export function parseTravelDocsChecklistFromAnswer(answer: string): TravelDocsChecklistPayload | null {
  const iStart = answer.indexOf(TRAVEL_DOCS_JSON_START);
  const iEnd = answer.indexOf(TRAVEL_DOCS_JSON_END);
  if (iStart === -1 || iEnd === -1 || iEnd <= iStart) return null;
  const raw = answer.slice(iStart + TRAVEL_DOCS_JSON_START.length, iEnd).trim();
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.items)) return null;
    const items: TravelDocsChecklistItem[] = [];
    for (const it of parsed.items as unknown[]) {
      const row = it as Record<string, unknown>;
      const requirement = typeof row?.requirement === "string" ? row.requirement.trim() : "";
      if (!requirement) continue;
      const notes = typeof row?.notes === "string" && row.notes.trim() ? row.notes.trim() : null;
      const country = typeof row?.country === "string" && row.country.trim() ? row.country.trim() : null;
      items.push({
        requirement,
        level: normalizeLevel(row?.level),
        notes,
        country,
      });
    }
    if (!items.length) return null;
    const title =
      typeof parsed.title === "string" && parsed.title.trim() ? parsed.title.trim() : "Documentos y trámites";
    const intro = typeof parsed.intro === "string" && parsed.intro.trim() ? parsed.intro.trim() : null;
    return { version: 1, title, intro, items };
  } catch {
    return null;
  }
}

export function levelLabel(level: TravelDocsChecklistLevel): string {
  switch (level) {
    case "obligatorio":
      return "Obligatorio";
    case "recomendado":
      return "Recomendado";
    default:
      return "Verificar";
  }
}
