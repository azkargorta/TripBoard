import type { DetectedDocumentData, DetectedDocumentType, ParserContext } from "./types";
import { parseBookingDocument } from "./booking";
import { parseAirbnbDocument } from "./airbnb";
import { parseRyanairDocument } from "./ryanair";
import { parseRenfeDocument } from "./renfe";
import { parseActivityDocument } from "./activity";
import { detectCurrency, pickAllDates, pickBestAmount, pickFirst, pickFirstTime, splitCityCountry } from "./helpers";

function baseGenericParse({ extractedText, fileName }: ParserContext): Partial<DetectedDocumentData> {
  const text = extractedText || "";
  const dates = pickAllDates(text);
  const address = pickFirst(text, [
    /(?:address|direcci[oó]n|location|ubicaci[oó]n)[:\s]+([^\n]+)/i,
  ]);
  const { city, country } = splitCityCountry(address);

  return {
    reservationCode: pickFirst(text, [/(?:reservation|booking|confirmation|locator|reference|localizador|c[oó]digo)[:\s#]*([A-Z0-9-]{4,})/i]),
    address,
    city,
    country,
    checkInDate: dates[0] || null,
    checkOutDate: dates[1] || null,
    checkInTime: pickFirstTime(text, [/(?:check-?in|entrada|arrival)[:\s]+([^\n]+)/i]),
    checkOutTime: pickFirstTime(text, [/(?:check-?out|salida|departure)[:\s]+([^\n]+)/i]),
    origin: pickFirst(text, [/(?:from|origin|salida)[:\s]+([^\n]+)/i]),
    destination: pickFirst(text, [/(?:to|destination|destino|llegada)[:\s]+([^\n]+)/i]),
    departureDate: dates[0] || null,
    arrivalDate: dates[1] || null,
    departureTime: pickFirstTime(text, [/(?:departure time|hora salida|departure)[:\s]+([^\n]+)/i]),
    arrivalTime: pickFirstTime(text, [/(?:arrival time|hora llegada|arrival)[:\s]+([^\n]+)/i]),
    guests: Number(pickFirst(text, [/(?:guests|h[uú]espedes|huespedes|passengers|participants|viajeros)[:\s]+(\d+)/i]) || "") || null,
    totalAmount: pickBestAmount(text),
    currency: detectCurrency(text),
    location: pickFirst(text, [/(?:venue|location|lugar|meeting point|punto de encuentro)[:\s]+([^\n]+)/i]),
    activityDate: dates[0] || null,
    activityTime: pickFirstTime(text, [/(?:time|hora|activity time)[:\s]+([^\n]+)/i]),
    providerName: null,
    reservationName: fileName?.replace(/\.[^.]+$/, "") || null,
  };
}

export function detectProviderSlug(extractedText: string, fileName?: string | null): string | null {
  const text = (extractedText || "").toLowerCase();
  const name = (fileName || "").toLowerCase();

  if (text.includes("booking.com") || name.includes("booking")) return "booking";
  if (text.includes("airbnb") || name.includes("airbnb")) return "airbnb";
  if (text.includes("ryanair") || name.includes("ryanair")) return "ryanair";
  if (text.includes("renfe") || name.includes("renfe")) return "renfe";
  if (/(ticket|tour|museo|museum|activity|actividad|excursion|entrada)/i.test(text) || /(ticket|tour|actividad|museo)/i.test(name)) return "activity";
  return null;
}

export function detectDocumentType(extractedText: string, fileName?: string | null): DetectedDocumentType {
  const text = (extractedText || "").toLowerCase();
  const name = (fileName || "").toLowerCase();

  if (/(hotel|booking\.com|airbnb|check-?in|check-?out|alojamiento|apartamento)/i.test(text) || /(hotel|booking|airbnb|alojamiento|reserva)/i.test(name)) return "hotel_reservation";
  if (/(boarding pass|flight|vuelo|terminal|gate|departure|arrival|airline)/i.test(text) || /(flight|boarding|vuelo|ryanair|vueling|iberia)/i.test(name)) return text.includes("boarding pass") ? "boarding_pass" : "flight_ticket";
  if (/(train|tren|renfe|platform|wagon|seat)/i.test(text) || /(tren|train|renfe)/i.test(name)) return "train_ticket";
  if (/(rental car|car rental|pickup|dropoff|vehicle|coche de alquiler)/i.test(text) || /(rental|coche|car)/i.test(name)) return "rental_car";
  if (/(ticket|entrada|tour|excursion|actividad|museum|museo|experience)/i.test(text) || /(ticket|entrada|tour|actividad|museo)/i.test(name)) return "activity_ticket";
  return "unknown";
}

export function parseDocumentByProvider(context: ParserContext): Partial<DetectedDocumentData> {
  const provider = detectProviderSlug(context.extractedText, context.fileName);

  if (provider === "booking") return parseBookingDocument(context);
  if (provider === "airbnb") return parseAirbnbDocument(context);
  if (provider === "ryanair") return parseRyanairDocument(context);
  if (provider === "renfe") return parseRenfeDocument(context);
  if (provider === "activity") return parseActivityDocument(context);

  return baseGenericParse(context);
}
