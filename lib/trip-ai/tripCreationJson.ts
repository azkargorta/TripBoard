/** Extrae el primer objeto JSON de un texto (p. ej. respuesta del modelo con ruido). */
export function extractJsonObject(text: string): unknown {
  const t = String(text || "").trim();

  // 1) Intento rápido: recorte entre primera "{" y última "}" (caso típico).
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0) {
    throw new Error("La respuesta no contiene JSON válido.");
  }

  // Caso frecuente: el modelo empieza un JSON pero se trunca y no llega a cerrar "}".
  // En ese caso intentamos repararlo/autocerrarlo.
  if (end <= start) {
    const tail = t.slice(start);
    const repairedTruncated = repairModelJson(appendMissingClosers(tail));
    try {
      return JSON.parse(repairedTruncated);
    } catch {
      throw new Error("La respuesta no contiene JSON válido.");
    }
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
          const repaired2 = repairModelJson(appendMissingClosers(balanced));
          return JSON.parse(repaired2);
        }
      }
      // Mantén el error original para que el mensaje sea útil al usuario.
      throw e1 instanceof Error ? e1 : new Error("No se pudo parsear el JSON devuelto por la IA.");
    }
  }
}

function appendMissingClosers(input: string): string {
  const s = String(input || "");
  let inString = false;
  let escape = false;
  const stack: Array<"}" | "]"> = [];

  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
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
    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if (ch === "}" || ch === "]") {
      if (stack.length && stack[stack.length - 1] === ch) stack.pop();
    }
  }

  if (!stack.length) return s;
  return s + stack.reverse().join("");
}

let _jsonrepair: ((input: string) => string) | null = null;
function getJsonRepair() {
  if (_jsonrepair) return _jsonrepair;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("jsonrepair") as { jsonrepair?: (input: string) => string } | ((input: string) => string);
    _jsonrepair = typeof mod === "function" ? mod : (mod?.jsonrepair ?? null);
  } catch {
    _jsonrepair = null;
  }
  return _jsonrepair;
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

  // Reparación estándar (maneja comas faltantes, quotes simples, etc.).
  const jr = getJsonRepair();
  if (jr) {
    try {
      s = jr(s);
    } catch {
      // seguimos con heurísticas locales
    }
  }

  // Reemplaza ';' por ',' fuera de strings (error típico en arrays).
  s = replaceOutsideStrings(s, ";", ",");

  // Inserta comas faltantes entre elementos de arrays (otro error muy frecuente del modelo).
  s = insertMissingArrayCommas(s);

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

function insertMissingArrayCommas(input: string): string {
  const isWs = (c: string) => c === " " || c === "\n" || c === "\r" || c === "\t";
  const isDigit = (c: string) => c >= "0" && c <= "9";
  const isValueStart = (c: string) =>
    c === "{" || c === "[" || c === '"' || c === "-" || isDigit(c) || c === "t" || c === "f" || c === "n";

  let out = "";
  const stack: Array<"array" | "object"> = [];
  let inString = false;
  let escape = false;

  // Marca si acabamos de emitir un valor completo dentro de un array.
  let justEndedArrayValue = false;

  const peekNextNonWs = (src: string, from: number) => {
    for (let j = from; j < src.length; j++) {
      const cj = src[j]!;
      if (!isWs(cj)) return { ch: cj, idx: j };
    }
    return { ch: "", idx: src.length };
  };

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
      if (ch === '"') {
        inString = false;
        // Una string completa cuenta como valor finalizado (si estamos en array).
        if (stack[stack.length - 1] === "array") justEndedArrayValue = true;
      }
      continue;
    }

    // Si estamos en array y acabamos de cerrar un valor, y el siguiente token es otro valor (sin coma),
    // insertamos una coma ANTES de consumir ese siguiente token.
    if (stack[stack.length - 1] === "array" && justEndedArrayValue) {
      const next = peekNextNonWs(input, i);
      if (next.idx === i && next.ch && next.ch !== "," && next.ch !== "]" && isValueStart(next.ch)) {
        out += ",";
        justEndedArrayValue = false;
        // no avanzamos i: seguimos procesando el mismo char actual
      }
    }

    if (isWs(ch)) {
      out += ch;
      continue;
    }

    if (ch === '"') {
      inString = true;
      out += ch;
      justEndedArrayValue = false;
      continue;
    }

    if (ch === "[") {
      stack.push("array");
      out += ch;
      justEndedArrayValue = false;
      continue;
    }

    if (ch === "{") {
      stack.push("object");
      out += ch;
      justEndedArrayValue = false;
      continue;
    }

    if (ch === "]" || ch === "}") {
      const top = stack[stack.length - 1];
      if (stack.length) stack.pop();
      out += ch;
      // Cerrar un objeto/array completo cuenta como valor finalizado si el contenedor es un array.
      if (top && stack[stack.length - 1] === "array") {
        justEndedArrayValue = true;
      } else if (stack[stack.length - 1] !== "array") {
        justEndedArrayValue = false;
      }
      continue;
    }

    if (ch === ",") {
      out += ch;
      justEndedArrayValue = false;
      continue;
    }

    if (ch === ":") {
      out += ch;
      justEndedArrayValue = false;
      continue;
    }

    // Números
    if (ch === "-" || isDigit(ch)) {
      let j = i;
      while (j < input.length) {
        const cj = input[j]!;
        if (isDigit(cj) || cj === "-" || cj === "+" || cj === "." || cj === "e" || cj === "E") j++;
        else break;
      }
      out += input.slice(i, j);
      i = j - 1;
      if (stack[stack.length - 1] === "array") justEndedArrayValue = true;
      continue;
    }

    // Literales: true/false/null (y cualquier palabra “accidental” la tratamos como token)
    if ((ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z")) {
      let j = i;
      while (j < input.length) {
        const cj = input[j]!;
        const isAlpha = (cj >= "a" && cj <= "z") || (cj >= "A" && cj <= "Z");
        if (isAlpha) j++;
        else break;
      }
      out += input.slice(i, j);
      i = j - 1;
      if (stack[stack.length - 1] === "array") justEndedArrayValue = true;
      continue;
    }

    // Cualquier otro símbolo lo copiamos tal cual.
    out += ch;
    justEndedArrayValue = false;
  }

  return out;
}
