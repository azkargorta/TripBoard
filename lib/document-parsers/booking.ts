import type { DetectedDocumentData, ParserContext } from "./types";
import {
  detectCurrency,
  pickAllDates,
  pickBestAmount,
  pickFirst,
  pickFirstTime,
  pickHotelStayDate,
  splitCityCountry,
} from "./helpers";

export function parseBookingDocument({ extractedText }: ParserContext): Partial<DetectedDocumentData> {
  const text = extractedText || "";
  const dates = pickAllDates(text);
  const address =
    pickFirst(text, [
      /(?:property address|address|direcci[oó]n|hotel address)[:\s]+([^\n]+)/i,
      /(?:property|hotel)[:\s]+([^\n]{10,})/i,
    ]) || null;
  const { city, country } = splitCityCountry(address);

  const checkInDate = pickHotelStayDate(text, "checkin") || dates[0] || null;
  const checkOutDate = pickHotelStayDate(text, "checkout") || dates[1] || null;

  return {
    providerSlug: "booking",
    documentType: "hotel_reservation",
    providerName: "Booking.com",
    reservationName: pickFirst(text, [/(?:property|hotel|staying at)[:\s]+([^\n]+)/i]) || "Booking.com",
    reservationCode: pickFirst(text, [
      /(?:booking number|reservation number|confirmation number|booking no\.?)[:\s#]*([A-Z0-9-]{4,})/i,
      /(?:pin code|pin)[:\s#]*([A-Z0-9-]{4,})/i,
    ]),
    address,
    city,
    country,
    checkInDate,
    checkOutDate,
    checkInTime: pickFirstTime(text, [/(?:check-in|entrada|arrival)[:\s]+([^\n]+)/i]),
    checkOutTime: pickFirstTime(text, [/(?:check-out|salida|departure)[:\s]+([^\n]+)/i]),
    guests: Number(pickFirst(text, [/(?:guests|adults|h[uú]espedes|huespedes)[:\s]+(\d+)/i]) || "") || null,
    totalAmount: pickBestAmount(text),
    currency: detectCurrency(text),
  };
}
