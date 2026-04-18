/** Extrae el primer objeto JSON de un texto (p. ej. respuesta del modelo con ruido). */
export function extractJsonObject(text: string): unknown {
  const t = text.trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("La respuesta no contiene JSON válido.");
  }
  return JSON.parse(t.slice(start, end + 1));
}
