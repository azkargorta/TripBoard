import type { DetectedDocumentData, ParserContext } from "./types";
import { detectCurrency, pickAllDates, pickBestAmount, pickFirst, pickFirstTime } from "./helpers";

export function parseRenfeDocument({ extractedText }: ParserContext): Partial<DetectedDocumentData> {
  const text = extractedText || "";
  const dates = pickAllDates(text);

  return {
    providerSlug: "renfe",
    documentType: "train_ticket",
    providerName: "Renfe",
    reservationName: "Renfe",
    reservationCode: pickFirst(text, [/(?:localizador|locator|reference|booking ref)[:\s#]*([A-Z0-9-]{4,})/i]),
    origin: pickFirst(text, [/(?:origen|from|salida)[:\s]+([^\n]+)/i]),
    destination: pickFirst(text, [/(?:destino|to|llegada)[:\s]+([^\n]+)/i]),
    departureDate: dates[0] || null,
    arrivalDate: dates[0] || null,
    departureTime: pickFirstTime(text, [/(?:salida|departure)[:\s]+([^\n]+)/i]),
    arrivalTime: pickFirstTime(text, [/(?:llegada|arrival)[:\s]+([^\n]+)/i]),
    passengers: Number(pickFirst(text, [/(?:viajeros|passengers|travellers)[:\s]+(\d+)/i]) || "") || 1,
    transportType: "train",
    seat: pickFirst(text, [/(?:plaza|seat|asiento)[:\s]+([^\n]+)/i]),
    totalAmount: pickBestAmount(text),
    currency: detectCurrency(text),
  };
}
