/** Texto corto para cabeceras (ej. barra superior del viaje). */
export function formatTripDateRangeHeader(start: string | null, end: string | null): string | null {
  if (!start && !end) return null;
  const fmt = (value: string) =>
    new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(`${value}T00:00:00`));
  if (start && end) return `${fmt(start)} — ${fmt(end)}`;
  if (start) return `Desde ${fmt(start)}`;
  if (end) return `Hasta ${fmt(end)}`;
  return null;
}
