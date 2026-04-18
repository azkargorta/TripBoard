/** Separador estable para varios lugares en el campo `trips.destination` (texto). */
export const TRIP_PLACES_SEPARATOR = " · ";

export function joinTripPlaces(parts: string[]): string {
  return parts
    .map((s) => s.trim())
    .filter(Boolean)
    .join(TRIP_PLACES_SEPARATOR);
}

/** Parte un destino guardado en filas para el formulario (una fila por lugar). */
export function splitTripPlaces(stored: string | null | undefined): string[] {
  const t = typeof stored === "string" ? stored.trim() : "";
  if (!t) return [""];
  const bits = t
    .split(/\s*·\s*|\s*\n\s*|\s*;\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  return bits.length ? bits : [""];
}

/** Primer lugar para geocoding / clima cuando hay varios separados por ` · `. */
export function primaryTripPlace(stored: string | null | undefined): string {
  const parts = splitTripPlaces(stored).filter((s) => s.trim());
  return (parts[0] || "").trim();
}
