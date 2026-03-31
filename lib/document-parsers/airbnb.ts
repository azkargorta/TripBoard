import type { DetectedDocumentData, ParserContext } from "./types";
import {
  detectCurrency,
  pickAllDates,
  pickBestAmount,
  pickFirst,
  pickHotelStayDate,
  splitCityCountry,
} from "./helpers";

export function parseAirbnbDocument({ extractedText }: ParserContext): Partial<DetectedDocumentData> {
  const text = extractedText || "";
  const dates = pickAllDates(text);
  const address =
    pickFirst(text, [
      /(?:where you'?ll be|location|address|direcci[oó]n)[:\s]+([^\n]+)/i,
    ]) || null;
  const { city, country } = splitCityCountry(address);

  const checkInDate = pickHotelStayDate(text, "checkin") || dates[0] || null;
  const checkOutDate = pickHotelStayDate(text, "checkout") || dates[1] || null;

  return {
    providerSlug: "airbnb",
    documentType: "hotel_reservation",
    providerName: "Airbnb",
    reservationName: pickFirst(text, [/(?:stay at|listing|reservation for)[:\s]+([^\n]+)/i]) || "Airbnb",
    reservationCode: pickFirst(text, [/(?:confirmation code|reservation code|code)[:\s#]*([A-Z0-9-]{4,})/i]),
    address,
    city,
    country,
    checkInDate,
    checkOutDate,
    guests: Number(pickFirst(text, [/(?:guests|h[uú]espedes|huespedes)[:\s]+(\d+)/i]) || "") || null,
    totalAmount: pickBestAmount(text),
    currency: detectCurrency(text),
  };
}
