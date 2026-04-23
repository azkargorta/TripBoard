import type { ExecutableItineraryPayload } from "@/lib/trip-ai/tripCreationTypes";

function normalizeTimeToMinutes(raw: string): number | null {
  const s = String(raw || "").trim().replace(".", ":");
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const hh = Math.max(0, Math.min(23, Number(m[1])));
  const mm = Math.max(0, Math.min(59, Number(m[2])));
  return hh * 60 + mm;
}

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

function guessCityFromText(text: string): string {
  const t = String(text || "").trim();
  if (!t) return "";
  // Caso típico: "Visita: Split" / "Excursión a Hvar"
  const m = /(?:visita|excursion|excursión|paseo|day\s*trip)\s*(?:a|:)?\s*([A-Za-zÀ-ÿ'’\-\s]{3,})$/i.exec(t);
  const cand = (m?.[1] || "").trim();
  if (cand && cand.length <= 40) return cand;
  // Última palabra si parece un topónimo corto.
  const last = t.split(/\s+/).slice(-1)[0] || "";
  return last.length >= 3 && last.length <= 22 ? last : "";
}

export type ItinerarySanityIssue =
  | { code: "day_city_mix"; message: string; dayIndex: number }
  | { code: "day_times_unsorted"; message: string; dayIndex: number }
  | { code: "addresses_too_generic"; message: string; dayIndex: number }
  | { code: "wrong_country"; message: string; dayIndex: number }
  | { code: "too_many_placeholders"; message: string };

export function sanityCheckItinerary(
  itinerary: ExecutableItineraryPayload,
  opts?: { destinationLabel?: string | null; baseCityByDay?: string[] | null }
): { ok: true } | { ok: false; issues: ItinerarySanityIssue[] } {
  const issues: ItinerarySanityIssue[] = [];
  const days = Array.isArray(itinerary?.days) ? itinerary.days : [];
  const destLabel = String(opts?.destinationLabel || "");
  const dest = normalizeCity(destLabel);
  const destParts = destLabel
    .split(/[,|;]+/g)
    .map((s) => normalizeCity(s))
    .filter(Boolean);
  const expectedCountry = destParts.length ? destParts[destParts.length - 1]! : dest;
  const expected = new Set([dest, expectedCountry].filter(Boolean));

  // Lista corta de países para detectar “fuera de país”.
  const knownCountries = new Set(
    [
      "argentina",
      "chile",
      "uruguay",
      "paraguay",
      "bolivia",
      "brasil",
      "brazil",
      "mexico",
      "méxico",
      "peru",
      "perú",
      "colombia",
      "venezuela",
      "ecuador",
      "panama",
      "panamá",
      "costa rica",
      "guatemala",
      "honduras",
      "nicaragua",
      "el salvador",
      "usa",
      "united states",
      "estados unidos",
      "canada",
      "canadá",
      "uk",
      "united kingdom",
      "reino unido",
      "ireland",
      "irlanda",
      "portugal",
      "spain",
      "espana",
      "españa",
      "france",
      "francia",
      "italy",
      "italia",
      "germany",
      "alemania",
      "austria",
      "suiza",
      "switzerland",
      "croatia",
      "croacia",
      "slovenia",
      "slovenia",
      "hungary",
      "hungria",
      "hungría",
      "bosnia",
      "bosnia and herzegovina",
      "serbia",
      "montenegro",
      "greece",
      "grecia",
      "turkey",
      "turquia",
      "turquía",
    ].map((x) => normalizeCity(x))
  );

  // Para el chequeo de direcciones genéricas (país en vez de ciudad), aceptamos el país esperado y el destino.
  const countryWords = new Set([...Array.from(expected.values()), ...Array.from(knownCountries.values())].filter(Boolean));

  const extractCountryFromAddress = (addrRaw: string) => {
    const parts = String(addrRaw || "")
      .split(",")
      .map((p) => normalizeCity(p))
      .filter(Boolean);
    if (!parts.length) return "";
    return parts[parts.length - 1] || "";
  };

  for (let di = 0; di < days.length; di++) {
    const day = days[di]!;
    const items = Array.isArray(day?.items) ? day.items : [];

    // 1) Horas crecientes (si hay start_time)
    const mins = items
      .map((it) => normalizeTimeToMinutes(String((it as any)?.start_time || "")))
      .filter((x): x is number => typeof x === "number");
    const sorted = [...mins].sort((a, b) => a - b);
    if (mins.length >= 2 && mins.join("|") !== sorted.join("|")) {
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
    let genericAddrCount = 0;
    let wrongCountryCount = 0;
    for (const it of items) {
      const addr = String((it as any)?.address || "");
      const place = String((it as any)?.place_name || "");
      const title = String((it as any)?.title || "");

      const addrCity = normalizeCity(cityFromAddress(addr));
      const addrCountry = extractCountryFromAddress(addr);
      const placeCity = normalizeCity(place);
      const titleCity = normalizeCity(guessCityFromText(title));

      if (addrCountry && knownCountries.has(addrCountry) && expected.size && !expected.has(addrCountry)) {
        wrongCountryCount += 1;
      }

      // Address muy genérica (solo país/destino) -> no la usamos para coherencia.
      if (addrCity && countryWords.has(addrCity)) genericAddrCount += 1;

      const add = (c: string) => {
        if (!c) return;
        if (countryWords.has(c)) return;
        cities.add(c);
      };
      add(addrCity);
      // place_name suele ser el POI: si es un topónimo (una palabra/corto) lo tratamos como ciudad.
      if (placeCity && placeCity.length <= 22 && !placeCity.includes(" ")) add(placeCity);
      if (titleCity && titleCity.length <= 22 && !titleCity.includes(" ")) add(titleCity);
    }

    // Si casi todo viene con address genérica, es señal de mala calidad (teletransportes suelen venir así).
    if (items.length >= 4 && genericAddrCount / Math.max(1, items.length) > 0.6) {
      issues.push({
        code: "addresses_too_generic",
        dayIndex: di,
        message: `Día ${di + 1}: direcciones demasiado genéricas (falta ciudad/país en muchos items).`,
      });
    }

    // País incorrecto: cualquier indicio fuerte debe invalidar el día.
    if (wrongCountryCount >= 1) {
      issues.push({
        code: "wrong_country",
        dayIndex: di,
        message: `Día ${di + 1}: hay lugares con país fuera del destino (revisa address).`,
      });
    }
    // Si hay más de una ciudad distinta, casi seguro es un itinerario incoherente.
    if (cities.size >= 2) {
      issues.push({
        code: "day_city_mix",
        dayIndex: di,
        message: `Día ${di + 1}: mezcla varias ciudades sin un traslado explícito.`,
      });
    }

    // 3) Si tenemos ciudad base por día, exigimos que no aparezcan ciudades claramente distintas.
    const baseIdx = typeof (day as any)?.day === "number" ? Math.max(0, Number((day as any).day) - 1) : di;
    const base = normalizeCity(String(opts?.baseCityByDay?.[baseIdx] || ""));
    if (base && cities.size === 1) {
      const only = Array.from(cities.values())[0] || "";
      if (only && only !== base) {
        issues.push({
          code: "day_city_mix",
          dayIndex: di,
          message: `Día ${typeof (day as any)?.day === "number" ? (day as any).day : di + 1}: planes en "${only}" pero la ciudad base prevista es "${base}".`,
        });
      }
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

