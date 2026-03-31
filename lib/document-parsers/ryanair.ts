import type { DetectedDocumentData, ParserContext } from "./types";
import { detectCurrency, pickAllDates, pickBestAmount, pickFirst, pickFirstTime } from "./helpers";

export function parseRyanairDocument({ extractedText }: ParserContext): Partial<DetectedDocumentData> {
  const text = extractedText || "";
  const dates = pickAllDates(text);

  return {
    providerSlug: "ryanair",
    documentType: /boarding pass/i.test(text) ? "boarding_pass" : "flight_ticket",
    providerName: "Ryanair",
    reservationName: "Ryanair",
    reservationCode: pickFirst(text, [/(?:booking ref|reference|pnr|reservation number)[:\s#]*([A-Z0-9-]{4,})/i]),
    origin: pickFirst(text, [/(?:from|origin|salida)[:\s]+([^\n]+)/i]),
    destination: pickFirst(text, [/(?:to|destination|destino|llegada)[:\s]+([^\n]+)/i]),
    departureDate: dates[0] || null,
    arrivalDate: dates[0] || null,
    departureTime: pickFirstTime(text, [/(?:departure|boarding time|hora salida)[:\s]+([^\n]+)/i]),
    arrivalTime: pickFirstTime(text, [/(?:arrival|hora llegada)[:\s]+([^\n]+)/i]),
    passengers: Number(pickFirst(text, [/(?:passenger|passengers|traveller|viajero)[:\s]+(\d+)/i]) || "") || 1,
    transportType: "flight",
    seat: pickFirst(text, [/(?:seat|asiento)[:\s]+([^\n]+)/i]),
    terminal: pickFirst(text, [/(?:terminal)[:\s]+([^\n]+)/i]),
    gate: pickFirst(text, [/(?:gate|puerta)[:\s]+([^\n]+)/i]),
    totalAmount: pickBestAmount(text),
    currency: detectCurrency(text),
  };
}
