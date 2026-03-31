export type DetectedDocumentData = {
  type: string;
  provider?: string | null;
  name?: string | null;
  code?: string | null;
  totalPrice?: number | null;
  currency?: string | null;
  checkInDate?: string | null;
  checkOutDate?: string | null;
  location?: string | null;
  confidence?: number;
  rawText?: string;
};

function extractPrice(text: string) {
  const priceRegex = /(grand total|total price|importe total|precio total|amount due|total|importe|amount|precio)[^0-9]{0,20}([0-9]+[.,][0-9]{2})/i;
  const match = text.match(priceRegex);
  if (!match) return null;
  return parseFloat(match[2].replace(",", "."));
}

function extractDates(text: string) {
  const isoMatches = [...text.matchAll(/\b(20\d{2})[-\/](\d{2})[-\/](\d{2})\b/g)].map(
    (m) => `${m[1]}-${m[2]}-${m[3]}`
  );
  if (isoMatches.length >= 2) {
    return { checkInDate: isoMatches[0], checkOutDate: isoMatches[1] };
  }

  const dmyMatches = [...text.matchAll(/\b(\d{2})[\/](\d{2})[\/](20\d{2})\b/g)].map(
    (m) => `${m[3]}-${m[2]}-${m[1]}`
  );
  if (dmyMatches.length >= 2) {
    return { checkInDate: dmyMatches[0], checkOutDate: dmyMatches[1] };
  }

  return { checkInDate: null, checkOutDate: null };
}

function detectProvider(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes("booking")) return "Booking";
  if (lower.includes("airbnb")) return "Airbnb";
  if (lower.includes("ryanair")) return "Ryanair";
  if (lower.includes("renfe")) return "Renfe";
  return null;
}

export function analyzeDocumentText(rawText: string, _fileName?: string | null): DetectedDocumentData {
  const provider = detectProvider(rawText);
  const price = extractPrice(rawText);
  const { checkInDate, checkOutDate } = extractDates(rawText);

  return {
    type: "hotel_reservation",
    provider,
    name: rawText.slice(0, 80) || null,
    code: null,
    totalPrice: price,
    currency: rawText.includes("$") ? "USD" : rawText.includes("£") ? "GBP" : "EUR",
    checkInDate,
    checkOutDate,
    location: null,
    confidence: 0.6,
    rawText,
  };
}

export function analyzeTravelDocument(rawText: string, fileName?: string | null) {
  return analyzeDocumentText(rawText, fileName);
}
