export type ExpenseAnalyzerResult = {
  title: string | null;
  category: string;
  amount: number | null;
  currency: string;
  expenseDate: string | null;
  merchantName: string | null;
  extractedText: string;
  extractedTextAvailable: boolean;
  extractionMethod: "pdf-parse" | "pdf-ocr" | "image-ocr" | "filename-fallback" | "empty";
  warnings: string[];
};

function cleanLine(line: string) {
  return line.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function parseCandidateAmount(raw: string) {
  const clean = raw.replace(/[^\d,.-]/g, "").trim();
  if (!clean) return null;

  const commaCount = (clean.match(/,/g) || []).length;
  const dotCount = (clean.match(/\./g) || []).length;
  let normalized = clean;

  if (commaCount > 0 && dotCount > 0) {
    if (clean.lastIndexOf(",") > clean.lastIndexOf(".")) {
      normalized = clean.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = clean.replace(/,/g, "");
    }
  } else if (commaCount > 0) {
    normalized = clean.replace(/\./g, "").replace(",", ".");
  } else {
    normalized = clean.replace(/,/g, "");
  }

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export function detectCurrency(text: string, fileName = "") {
  const blob = `${text}\n${fileName}`.toLowerCase();
  if (blob.includes(" usd") || blob.includes(" us$") || blob.includes("$")) return "USD";
  if (blob.includes(" gbp") || blob.includes("£")) return "GBP";
  if (blob.includes(" jpy") || blob.includes("¥")) return "JPY";
  if (blob.includes(" chf")) return "CHF";
  if (blob.includes(" cad")) return "CAD";
  if (blob.includes(" aud")) return "AUD";
  if (blob.includes(" mad")) return "MAD";
  if (blob.includes(" eur") || blob.includes("€")) return "EUR";
  return "EUR";
}

export function detectCategory(text: string, fileName = "", mimeType = "") {
  const blob = `${fileName} ${mimeType} ${text}`.toLowerCase();

  if (
    blob.includes("hotel") ||
    blob.includes("booking") ||
    blob.includes("alojamiento") ||
    blob.includes("hostel") ||
    blob.includes("apartment") ||
    blob.includes("habitación") ||
    blob.includes("check-in")
  ) return "lodging";

  if (
    blob.includes("uber") ||
    blob.includes("cabify") ||
    blob.includes("taxi") ||
    blob.includes("flight") ||
    blob.includes("boarding") ||
    blob.includes("tren") ||
    blob.includes("train") ||
    blob.includes("bus") ||
    blob.includes("parking") ||
    blob.includes("fuel") ||
    blob.includes("peaje")
  ) return "transport";

  if (
    blob.includes("restaurant") ||
    blob.includes("restaurante") ||
    blob.includes("meal") ||
    blob.includes("food") ||
    blob.includes("breakfast") ||
    blob.includes("dinner") ||
    blob.includes("lunch") ||
    blob.includes("cafeteria")
  ) return "food";

  if (
    blob.includes("museum") ||
    blob.includes("ticket") ||
    blob.includes("entrada") ||
    blob.includes("admission")
  ) return "tickets";

  if (
    blob.includes("shopping") ||
    blob.includes("store") ||
    blob.includes("shop")
  ) return "shopping";

  return "general";
}

export function detectDate(text: string) {
  const patterns = [
    /\b(\d{4})[-/](\d{2})[-/](\d{2})\b/,
    /\b(\d{2})[-/](\d{2})[-/](\d{4})\b/,
    /\b(\d{2})\.(\d{2})\.(\d{4})\b/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    if (pattern === patterns[0]) return `${match[1]}-${match[2]}-${match[3]}`;
    return `${match[3]}-${match[2]}-${match[1]}`;
  }

  return null;
}

function findAmountCandidates(text: string) {
  const lines = text.split(/\r?\n/).map(cleanLine).filter(Boolean);
  const candidates: Array<{ value: number; score: number }> = [];

  const labeledPatterns = [
    /(?:total|importe total|total a pagar|amount due|grand total|balance due|precio final|final total)[:\s]*([€$£¥]?\s?\d[\d.,]*)/i,
    /([€$£¥]?\s?\d[\d.,]*)[:\s]*(?:total|importe total|amount due|grand total)/i,
  ];

  for (const line of lines) {
    for (const pattern of labeledPatterns) {
      const match = line.match(pattern);
      const raw = match?.[1];
      if (!raw) continue;
      const value = parseCandidateAmount(raw);
      if (value != null) candidates.push({ value, score: 100 });
    }

    const all = line.match(/[€$£¥]?\s?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})/g) || [];
    for (const raw of all) {
      const value = parseCandidateAmount(raw);
      if (value == null) continue;
      let score = 10;
      if (/total|importe|amount|balance|price|precio/i.test(line)) score += 50;
      if (/iva|vat|tax|impuesto/i.test(line)) score -= 20;
      candidates.push({ value, score });
    }
  }

  return candidates.filter((item) => item.value > 0).sort((a, b) => b.score - a.score || b.value - a.value);
}

export function detectAmount(text: string) {
  return findAmountCandidates(text)[0]?.value ?? null;
}

export function detectMerchantName(text: string, fileName = "") {
  const lines = text.split(/\r?\n/).map(cleanLine).filter(Boolean).slice(0, 18);
  const banned = [
    "factura", "invoice", "receipt", "booking", "confirmación", "confirmation",
    "total", "importe", "fecha", "date", "tax", "vat", "número", "numero"
  ];

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (line.length < 3 || line.length > 80) continue;
    if (banned.some((word) => lower.includes(word))) continue;
    if (/\d{2}[-/]\d{2}[-/]\d{4}/.test(line)) continue;
    return line;
  }

  const fallback = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return fallback || null;
}

function monthNameToNumber(monthRaw: string) {
  const month = monthRaw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const months: Record<string, string> = {
    enero: "01",
    febrero: "02",
    marzo: "03",
    abril: "04",
    mayo: "05",
    junio: "06",
    julio: "07",
    agosto: "08",
    septiembre: "09",
    setiembre: "09",
    octubre: "10",
    noviembre: "11",
    diciembre: "12",
    january: "01",
    february: "02",
    march: "03",
    april: "04",
    may: "05",
    june: "06",
    july: "07",
    august: "08",
    september: "09",
    october: "10",
    november: "11",
    december: "12",
  };
  return months[month] || null;
}

function extractBookingCheckInDate(text: string) {
  const normalized = text.replace(/\r/g, "");
  const patterns = [
    /ENTRADA\s+(\d{1,2})\s+([A-Za-zÁÉÍÓÚáéíóúñÑ]+)\s+\w+\s+desde/i,
    /CHECK-?IN\s+(\d{1,2})\s+([A-Za-zÁÉÍÓÚáéíóúñÑ]+)\s+\w+/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) continue;
    const day = match[1].padStart(2, "0");
    const month = monthNameToNumber(match[2]);
    if (!month) continue;

    const yearMatch = normalized.match(/\b(20\d{2})\b/);
    const year = yearMatch?.[1];
    if (!year) continue;

    return `${year}-${month}-${day}`;
  }

  return null;
}

function extractBookingMerchant(text: string) {
  const lines = text.split(/\r?\n/).map(cleanLine).filter(Boolean).slice(0, 12);
  const banned = [
    "booking.com",
    "confirmación",
    "confirmation",
    "número de confirmación",
    "codigo pin",
    "código pin",
    "entrada",
    "salida",
  ];

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (line.length < 4 || line.length > 90) continue;
    if (banned.some((word) => lower.includes(word))) continue;
    if (/^(dirección|telefono|teléfono|coordenadas|booking\.com)/i.test(line)) continue;
    return line;
  }

  return null;
}

function extractBookingAmount(text: string) {
  const normalized = text.replace(/\r/g, "");
  const patterns = [
    /Precio final\s*\(.*?\)\s*([€$£¥]?\s?\d[\d.,]*)/i,
    /El precio final.*?([€$£¥]?\s?\d[\d.,]*)/i,
    /Precio\s*\(para.*?\)\s*([€$£¥]?\s?\d[\d.,]*)/i,
    /PRECIO.*?([€$£¥]?\s?\d[\d.,]*)/i,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    const raw = match?.[1];
    if (!raw) continue;
    const value = parseCandidateAmount(raw);
    if (value != null) return value;
  }

  return null;
}

function detectBookingReservationExpense(text: string, fileName: string, mimeType: string) {
  const blob = `${fileName} ${mimeType} ${text}`.toLowerCase();

  if (
    !blob.includes("booking.com") &&
    !blob.includes("confirmación de la reserva") &&
    !blob.includes("numero de confirmacion") &&
    !blob.includes("número de confirmación")
  ) {
    return null;
  }

  const merchant = extractBookingMerchant(text) || detectMerchantName(text, fileName);
  const amount = extractBookingAmount(text) ?? detectAmount(text);
  const currency = detectCurrency(text, fileName);
  const expenseDate = extractBookingCheckInDate(text) || detectDate(text);

  const warnings: string[] = [];
  if (amount == null) warnings.push("No se detectó el precio final de la reserva.");
  if (!expenseDate) warnings.push("No se detectó la fecha de entrada de la reserva.");

  return {
    title: merchant || fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() || null,
    category: "lodging",
    amount,
    currency,
    expenseDate,
    merchantName: merchant,
    warnings,
  };
}

export function buildExpenseAnalyzerResult(params: {
  text: string;
  fileName: string;
  mimeType: string;
  extractionMethod: ExpenseAnalyzerResult["extractionMethod"];
}) {
  const text = params.text || "";

  const booking = detectBookingReservationExpense(text, params.fileName, params.mimeType);
  const title =
    booking?.title ||
    detectMerchantName(text, params.fileName) ||
    params.fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim() ||
    null;

  const category = booking?.category || detectCategory(text, params.fileName, params.mimeType);
  const amount = booking?.amount ?? detectAmount(text);
  const currency = booking?.currency || detectCurrency(text, params.fileName);
  const expenseDate = booking?.expenseDate || detectDate(text);
  const merchantName = booking?.merchantName || detectMerchantName(text, params.fileName);

  const warnings: string[] = [];
  if (!text.trim()) warnings.push("No se pudo extraer texto útil.");
  if (amount == null) warnings.push("No se detectó el importe automáticamente.");
  if (!expenseDate) warnings.push("No se detectó la fecha automáticamente.");
  if (booking?.warnings?.length) warnings.push(...booking.warnings);

  return {
    title,
    category,
    amount,
    currency,
    expenseDate,
    merchantName,
    extractedText: text.slice(0, 12000),
    extractedTextAvailable: Boolean(text.trim()),
    extractionMethod: params.extractionMethod,
    warnings,
  } satisfies ExpenseAnalyzerResult;
}
