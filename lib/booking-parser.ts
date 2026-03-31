export type BookingParsedResult = {
  providerName: string | null;
  reservationName: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  customerName: string | null;
  guests: number | null;
  rooms: number | null;
  nights: number | null;
  reservationCode: string | null;
  pinCode: string | null;
  checkInDate: string | null;
  checkInTime: string | null;
  checkOutDate: string | null;
  checkOutTime: string | null;
  baseAmount: number | null;
  taxesAmount: number | null;
  totalAmount: number | null;
  currency: string | null;
};

const MONTHS: Record<string, string> = {
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
};

function cleanText(text: string) {
  return text.replace(/\r/g, "").replace(/[ \t]+/g, " ").trim();
}

function toIsoDate(day: string, monthWord: string, year: string) {
  const month = MONTHS[monthWord.toLowerCase()];
  if (!month) return null;
  return `${year}-${month}-${day.padStart(2, "0")}`;
}

function extractAmount(text: string, labelPattern: RegExp): number | null {
  const match = text.match(labelPattern);
  if (!match?.[1]) return null;
  const parsed = Number(match[1].replace(".", "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function extractBookingDateTime(text: string, kind: "ENTRADA" | "SALIDA") {
  const re = new RegExp(
    `${kind}\s+(\d{1,2})\s+([A-ZÁÉÍÓÚa-záéíóú]+)(?:.|\n|\r)*?(desde|hasta)\s+las\s+(\d{1,2}:\d{2})`,
    "i"
  );
  const match = text.match(re);
  if (!match) {
    return { date: null, time: null };
  }

  const yearMatch = text.match(/(20\d{2})/);
  const year = yearMatch?.[1] || String(new Date().getFullYear());
  const date = toIsoDate(match[1], match[2], year);

  return {
    date,
    time: match[4].padStart(5, "0"),
  };
}

export function parseBookingReservation(rawText: string): BookingParsedResult {
  const text = cleanText(rawText);

  const providerName = /booking\.com/i.test(text) ? "Booking.com" : null;

  const reservationName =
    text.match(/^([^\n]+?)\s+Dirección:/im)?.[1]?.trim() ||
    text.match(/puedes ponerte en contacto con el\s+([^\n]+?)\s+en el/im)?.[1]?.trim() ||
    null;

  const address =
    text.match(/Dirección:\s*([^\n]+?Francia|[^\n]+?España|[^\n]+?Portugal|[^\n]+?Italia|[^\n]+?Alemania)/i)?.[1]?.trim() ||
    null;

  const city =
    address?.match(/\b(\d{5})\s+([^,]+),\s*([^,]+)$/)?.[2]?.trim() ||
    address?.match(/,\s*([^,]+),\s*Francia$/i)?.[1]?.trim() ||
    null;

  const country =
    address?.match(/,\s*(Francia|España|Portugal|Italia|Alemania)$/i)?.[1]?.trim() ||
    null;

  const customerName =
    text.match(/Nombre del cliente:\s*([^\n]+)/i)?.[1]?.trim() || null;

  const guestsRaw =
    text.match(/Número de personas:\s*(\d+)\s+adult/i)?.[1] ||
    text.match(/(\d+)\s+adult/i)?.[1] ||
    null;
  const guests = guestsRaw ? Number(guestsRaw) : null;

  const roomsRaw = text.match(/HABITACIONES\s+(\d+)/i)?.[1] || null;
  const rooms = roomsRaw ? Number(roomsRaw) : null;

  const nightsRaw = text.match(/NOCHES\s+(\d+)/i)?.[1] || null;
  const nights = nightsRaw ? Number(nightsRaw) : null;

  const reservationCode =
    text.match(/N[ÚU]MERO DE CONFIRMACI[ÓO]N:\s*([0-9.\-]+)/i)?.[1]?.trim() || null;

  const pinCode =
    text.match(/C[ÓO]DIGO PIN:\s*([0-9]+)/i)?.[1]?.trim() || null;

  const entry = extractBookingDateTime(text, "ENTRADA");
  const exit = extractBookingDateTime(text, "SALIDA");

  const baseAmount = extractAmount(
    text,
    /Precio \(para \d+ personas\)\s*€\s*([0-9.,]+)/i
  );

  const taxesAmount = extractAmount(
    text,
    /Impuesto municipal[^€]*€\s*([0-9.,]+)/i
  );

  const totalAmount = extractAmount(
    text,
    /Precio final \(impuestos incluidos\)\s*€\s*([0-9.,]+)/i
  );

  return {
    providerName,
    reservationName,
    address,
    city,
    country,
    customerName,
    guests,
    rooms,
    nights,
    reservationCode,
    pinCode,
    checkInDate: entry.date,
    checkInTime: entry.time,
    checkOutDate: exit.date,
    checkOutTime: exit.time,
    baseAmount,
    taxesAmount,
    totalAmount,
    currency: totalAmount !== null || baseAmount !== null ? "EUR" : null,
  };
}
