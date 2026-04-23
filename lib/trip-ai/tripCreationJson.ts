/** Extrae el primer objeto JSON de un texto (p. ej. respuesta del modelo con ruido). */
export function extractJsonObject(text: string): unknown {
  const t = String(text || "").trim();

  // 1) Intento rápido: recorte entre primera "{" y última "}" (caso típico).
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("La respuesta no contiene JSON válido.");
  }
  const raw = t.slice(start, end + 1);
  try {
    return JSON.parse(raw);
  } catch (e1) {
    // 2) Intento robusto: reparaciones comunes cuando el modelo devuelve “JSON casi válido”.
    const repaired = repairModelJson(raw);
    try {
      return JSON.parse(repaired);
    } catch {
      // 3) Último intento: buscar el primer objeto JSON por balanceo de llaves.
      const balanced = extractBalancedJsonObject(t);
      if (balanced) {
        try {
          return JSON.parse(balanced);
        } catch {
          const repaired2 = repairModelJson(balanced);
          return JSON.parse(repaired2);
        }
      }
      // Mantén el error original para que el mensaje sea útil al usuario.
      throw e1 instanceof Error ? e1 : new Error("No se pudo parsear el JSON devuelto por la IA.");
    }
  }
}

function extractBalancedJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i]!;
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function repairModelJson(input: string): string {
  let s = String(input || "");

  // Quita fences de markdown si aparecen dentro del recorte.
  s = s.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");

  // Normaliza separadores de línea “raros” que a veces aparecen en respuestas.
  s = s.replace(/\u2028|\u2029/g, "\n");

  // Reemplaza ';' por ',' fuera de strings (error típico en arrays).
  s = replaceOutsideStrings(s, ";", ",");

  // Elimina comas colgantes antes de ']' o '}' (otro error frecuente del modelo).
  // Nota: repetimos hasta estabilizar porque puede haber cascadas.
  for (let i = 0; i < 4; i++) {
    const next = s.replace(/,\s*([}\]])/g, "$1");
    if (next === s) break;
    s = next;
  }

  return s.trim();
}

function replaceOutsideStrings(input: string, fromChar: string, toChar: string): string {
  let out = "";
  let inString = false;
  let escape = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (inString) {
      out += ch;
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    out += ch === fromChar ? toChar : ch;
  }
  return out;
}
