/**
 * Document Analyzer PRO
 * Compatible con Vercel + alias para analyzeTravelDocument
 */

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
  const priceRegex = /(total|importe|amount|precio)[^0-9]{0,10}([0-9]+[.,][0-9]{2})/i;
  const match = text.match(priceRegex);
  if (!match) return null;
  return parseFloat(match[2].replace(",", "."));
}

function extractDates(text: string) {
  const dateRegex = /(\d{2}\/\d{2}\/\d{4})/g;
  const matches = text.match(dateRegex);
  if (!matches || matches.length < 2) return { checkInDate: null, checkOutDate: null };

  return {
    checkInDate: matches[0],
    checkOutDate: matches[1]
  };
}

function detectProvider(text: string) {
  const lower = text.toLowerCase();
  if (lower.includes("booking")) return "Booking";
  if (lower.includes("airbnb")) return "Airbnb";
  if (lower.includes("ryanair")) return "Ryanair";
  if (lower.includes("renfe")) return "Renfe";
  return null;
}

export function analyzeDocumentText(rawText: string): DetectedDocumentData {
  const provider = detectProvider(rawText);
  const price = extractPrice(rawText);
  const { checkInDate, checkOutDate } = extractDates(rawText);

  return {
    type: "hotel_reservation",
    provider,
    name: rawText.slice(0, 50),
    code: null,
    totalPrice: price,
    currency: "EUR",
    checkInDate,
    checkOutDate,
    location: null,
    confidence: 0.6,
    rawText,
  };
}

/**
 * 🔥 FIX CLAVE PARA VERCEL
 * Alias para compatibilidad con imports antiguos
 */
export function analyzeTravelDocument(rawText: string, fileName?: string | null) {
  return analyzeDocumentText(rawText);
}
