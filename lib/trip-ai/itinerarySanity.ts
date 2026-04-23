import type { ExecutableItineraryPayload } from "@/lib/trip-ai/tripCreationTypes";

function cityFromAddress(addressRaw: string): string {
  const raw = String(addressRaw || "").trim();
  if (!raw) return "";
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    if (parts.length >= 3) return String(parts[parts.length - 2] || parts[0] || "").replace(/^\d+\s+/, "");
    return String(parts[0] || "").replace(/^\d+\s+/, "");
  }
  return raw.replace(/^\d+\s+/, "");
}

function normalizeCity(x: string): string {
  return String(x || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function isTimeLike(s: string): boolean {
  return /^\d{1,2}:\d{2}$/.test(String(s || "").trim());
}

export type ItinerarySanityIssue =
  | { code: "day_city_mix"; message: string; dayIndex: number }
  | { code: "day_times_unsorted"; message: string; dayIndex: number }
  | { code: "too_many_placeholders"; message: string };

export function sanityCheckItinerary(itinerary: ExecutableItineraryPayload): { ok: true } | { ok: false; issues: ItinerarySanityIssue[] } {
  const issues: ItinerarySanityIssue[] = [];
  const days = Array.isArray(itinerary?.days) ? itinerary.days : [];

  for (let di = 0; di < days.length; di++) {
    const day = days[di]!;
    const items = Array.isArray(day?.items) ? day.items : [];

    // 1) Horas crecientes (si hay start_time)
    const times = items
      .map((it) => String((it as any)?.start_time || "").trim())
      .filter((t) => isTimeLike(t));
    const sorted = [...times].sort((a, b) => a.localeCompare(b));
    if (times.length >= 2 && times.join("|") !== sorted.join("|")) {
      issues.push({
        code: "day_times_unsorted",
        dayIndex: di,
        message: `Día ${di + 1}: las horas no están en orden creciente.`,
      });
    }

    // 2) Mezcla de ciudades el mismo día (heurística por address), permitiendo transporte
    const hasTransport = items.some((it) => String((it as any)?.activity_kind || "").toLowerCase() === "transport");
    if (hasTransport) continue;

    const cities = new Set<string>();
    for (const it of items) {
      const addr = String((it as any)?.address || "");
      const city = normalizeCity(cityFromAddress(addr));
      if (city) cities.add(city);
    }
    // Si hay más de una ciudad distinta, casi seguro es un itinerario incoherente.
    if (cities.size >= 2) {
      issues.push({
        code: "day_city_mix",
        dayIndex: di,
        message: `Día ${di + 1}: mezcla varias ciudades sin un traslado explícito.`,
      });
    }
  }

  if (issues.length) return { ok: false, issues };
  return { ok: true };
}

export function sanityCheckPlaceholders(
  itinerary: ExecutableItineraryPayload,
  params: { generateDays: number; destinationLabel: string }
): { ok: true } | { ok: false; issue: ItinerarySanityIssue } {
  const days = Array.isArray(itinerary?.days) ? itinerary.days : [];
  const g = Math.max(1, Math.min(params.generateDays, days.length));
  const dest = normalizeCity(params.destinationLabel);
  let placeholders = 0;
  for (let i = 0; i < g; i++) {
    const items = Array.isArray(days[i]?.items) ? (days[i]!.items as any[]) : [];
    if (items.length !== 1) continue;
    const title = String(items[0]?.title || "");
    const addr = normalizeCity(String(items[0]?.address || ""));
    if (/^\s*explorar\s+/i.test(title) && (addr.includes(dest) || !addr.trim())) {
      placeholders += 1;
    }
  }
  // Si más de 25% de los días generados son placeholders, consideramos que la generación falló.
  if (g >= 4 && placeholders / g > 0.25) {
    return { ok: false, issue: { code: "too_many_placeholders", message: "Demasiados días placeholder sin planes reales." } };
  }
  return { ok: true };
}

