export function normalizeSpaces(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function cleanLineValue(value: string | null) {
  if (!value) return null;
  const normalized = normalizeSpaces(value)
    .replace(/^[\s:.-]+/, "")
    .replace(/[\s:.-]+$/, "");
  return normalized || null;
}

export function pickFirst(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = cleanLineValue(match?.[1] || null);
    if (value) return value;
  }
  return null;
}

export function pickAllDates(text: string): string[] {
  const results = new Set<string>();
  for (const match of text.matchAll(/\b(20\d{2})[-\/](\d{2})[-\/](\d{2})\b/g)) {
    results.add(`${match[1]}-${match[2]}-${match[3]}`);
  }
  for (const match of text.matchAll(/\b(\d{2})[\/\-](\d{2})[\/\-](20\d{2})\b/g)) {
    results.add(`${match[3]}-${match[2]}-${match[1]}`);
  }
  return Array.from(results);
}

export function extractFirstDateFromText(text: string | null): string | null {
  if (!text) return null;

  const iso = text.match(/\b(20\d{2})[-\/](\d{2})[-\/](\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dmy = text.match(/\b(\d{2})[\/\-](\d{2})[\/\-](20\d{2})\b/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;

  return null;
}

export function pickHotelStayDate(text: string, mode: "checkin" | "checkout"): string | null {
  const strongCheckIn = [
    /(?:check-?in|entrada|arrival|llegada)[:\s]+([^\n]+)/i,
    /(?:from|desde)[:\s]+([^\n]+)/i,
  ];
  const strongCheckOut = [
    /(?:check-?out|salida|departure)[:\s]+([^\n]+)/i,
    /(?:until|to|hasta)[:\s]+([^\n]+)/i,
  ];

  const ignorePatterns = /(booking date|reservation date|issue date|created|generated|fecha de emisi[oó]n|fecha de creaci[oó]n|confirmation date)/i;

  const patterns = mode === "checkin" ? strongCheckIn : strongCheckOut;

  const lines = text
    .split(/\n+/)
    .map((line) => normalizeSpaces(line))
    .filter(Boolean);

  for (const line of lines) {
    if (ignorePatterns.test(line)) continue;
    if (patterns.some((pattern) => pattern.test(line))) {
      const date = extractFirstDateFromText(line);
      if (date) return date;
    }
  }

  return null;
}

export function pickFirstTime(text: string, patterns: RegExp[]): string | null {
  const raw = pickFirst(text, patterns);
  if (!raw) return null;
  const match = raw.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
}

export function detectCurrency(text: string): string | null {
  const upper = text.toUpperCase();
  if (upper.includes("EUR") || upper.includes("€")) return "EUR";
  if (upper.includes("USD") || upper.includes("$")) return "USD";
  if (upper.includes("GBP") || upper.includes("£")) return "GBP";
  if (upper.includes("CHF")) return "CHF";
  return null;
}

function parseAmountString(raw: string): number | null {
  const cleaned = raw
    .replace(/[€$£A-Z\s]/gi, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function amountsFromLine(line: string): number[] {
  const results: number[] = [];
  for (const match of line.matchAll(/(?:€|\$|£|EUR|USD|GBP|CHF)?\s*\d{1,4}(?:[.,]\d{3})*(?:[.,]\d{2})/gi)) {
    const value = parseAmountString(match[0]);
    if (value != null) results.push(value);
  }
  return results;
}

function scoreLineForFinalPrice(line: string): number {
  const lower = line.toLowerCase();
  let score = 0;

  if (/(grand total|total price|importe total|precio total|amount due|total paid|paid total|final total|final price|total stay|total booking|precio final)/i.test(lower)) score += 100;
  if (/\btotal\b/i.test(lower)) score += 50;
  if (/(including taxes|taxes included|con impuestos|impuestos incluidos|all taxes and charges included)/i.test(lower)) score += 35;
  if (/(paid|payment|pagado|charged|charge total)/i.test(lower)) score += 25;

  if (/(subtotal|base price|room price|nightly rate|per night|precio por noche|before taxes|antes de impuestos)/i.test(lower)) score -= 80;
  if (/(cleaning fee|service fee|city tax|occupancy tax|vat|iva|tourist tax|taxes and fees|fees)/i.test(lower)) score -= 45;
  if (/(booking|confirmation|locator|reference|reservation code|localizador|codigo|código|pin)/i.test(lower)) score -= 100;

  if (/(€|\$|£|EUR|USD|GBP|CHF)/i.test(lower)) score += 10;

  return score;
}

export function pickBestAmount(text: string): number | null {
  const lines = text
    .split(/\n+/)
    .map((line) => normalizeSpaces(line))
    .filter(Boolean);

  const scoredCandidates: Array<{ amount: number; score: number }> = [];

  for (const line of lines) {
    const candidates = amountsFromLine(line);
    if (!candidates.length) continue;

    const baseScore = scoreLineForFinalPrice(line);
    for (const amount of candidates) {
      scoredCandidates.push({
        amount,
        score: baseScore + Math.min(amount / 100, 10),
      });
    }
  }

  scoredCandidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.amount - a.amount;
  });

  if (scoredCandidates.length > 0 && scoredCandidates[0].score > -20) {
    return scoredCandidates[0].amount;
  }

  const generic = lines.filter(
    (line) => !/(booking|confirmation|locator|reference|reservation code|localizador|codigo|código|pin)/i.test(line)
  );
  const fallbackAmounts = generic.flatMap(amountsFromLine).sort((a, b) => b - a);
  return fallbackAmounts[0] ?? null;
}

export function splitCityCountry(address: string | null): { city: string | null; country: string | null } {
  if (!address) return { city: null, country: null };
  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return {
      city: parts[parts.length - 2] || null,
      country: parts[parts.length - 1] || null,
    };
  }
  return { city: null, country: null };
}
