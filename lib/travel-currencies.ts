/**
 * Monedas ISO 4217 en uso para viajes (sin fondos, metales ni códigos históricos de `supportedValuesOf`).
 * Orden de popularidad aproximado para rellenar el desplegable tras las sugeridas por destino.
 */
const POPULAR_TRAVEL_ORDER = [
  "EUR",
  "USD",
  "GBP",
  "CHF",
  "JPY",
  "CAD",
  "AUD",
  "MXN",
  "BRL",
  "ARS",
  "CLP",
  "COP",
  "PEN",
  "UYU",
  "VES",
  "BOB",
  "PYG",
  "CRC",
  "CUP",
  "DOP",
  "GTQ",
  "PAB",
  "NOK",
  "SEK",
  "DKK",
  "PLN",
  "CZK",
  "HUF",
  "RON",
  "BGN",
  "ISK",
  "TRY",
  "RUB",
  "UAH",
  "AED",
  "SAR",
  "QAR",
  "ILS",
  "EGP",
  "MAD",
  "ZAR",
  "THB",
  "SGD",
  "MYR",
  "IDR",
  "PHP",
  "VND",
  "HKD",
  "TWD",
  "KRW",
  "INR",
  "CNY",
  "NZD",
  "XCD",
  "TTD",
  "JMD",
  "BSD",
  "BZD",
] as const;

const ALLOWED = new Set<string>(POPULAR_TRAVEL_ORDER);

/** Palabras del destino (es/en) → código ISO. La primera coincidencia gana el orden de sugerencia. */
const DESTINATION_CURRENCY_RULES: ReadonlyArray<{ keys: readonly string[]; code: string }> = [
  { keys: ["españa", "spain", "españ", "cataluña", "catalunya", "madrid", "barcelona", "sevilla", "valencia", "bilbao", "granada", "mallorca", "ibiza", "canarias", "galicia", "país vasco", "euskadi"], code: "EUR" },
  { keys: ["portugal", "lisboa", "oporto", "porto", "algarve"], code: "EUR" },
  { keys: ["francia", "france", "parís", "paris", "lyon", "marsella", "marseille", "niza", "nice", "bordeaux", "toulouse"], code: "EUR" },
  { keys: ["italia", "italy", "roma", "rome", "milán", "milan", "florencia", "florence", "venecia", "venice", "nápoles", "naples", "sicilia", "sicily", "sardinia", "cerdeña"], code: "EUR" },
  { keys: ["alemania", "germany", "berlín", "berlin", "munich", "múnich", "frankfurt", "hamburgo", "hamburg", "colonia", "cologne"], code: "EUR" },
  { keys: ["países bajos", "netherlands", "holanda", "amsterdam", "ásterdam", "rotterdam", "utrecht"], code: "EUR" },
  { keys: ["bélgica", "belgium", "bruselas", "brussels", "amberes", "antwerp", "gante", "gent"], code: "EUR" },
  { keys: ["austria", "viena", "vienna", "salzburgo", "salzburg", "innsbruck"], code: "EUR" },
  { keys: ["grecia", "greece", "atenas", "athens", "santorini", "mykonos", "creta", "crete"], code: "EUR" },
  { keys: ["irlanda", "ireland", "dublín", "dublin"], code: "EUR" },
  { keys: ["croacia", "croatia", "zagreb", "dubrovnik", "split"], code: "EUR" },
  { keys: ["suiza", "switzerland", "zúrich", "zurich", "ginebra", "geneva", "basilea", "basel", "bern", "berna", "lucerna"], code: "CHF" },
  { keys: ["reino unido", "united kingdom", "uk", "inglaterra", "england", "escocia", "scotland", "gales", "wales", "irlanda del norte", "londres", "london", "edimburgo", "edinburgh", "manchester", "liverpool"], code: "GBP" },
  { keys: ["estados unidos", "united states", "usa", "eeuu", "u.s.", "new york", "nueva york", "california", "florida", "texas", "miami", "los angeles", "chicago", "boston", "washington", "hawaii", "honolulu", "las vegas", "san francisco"], code: "USD" },
  { keys: ["canadá", "canada", "toronto", "vancouver", "montreal", "quebec", "calgary"], code: "CAD" },
  { keys: ["méxico", "mexico", "cdmx", "ciudad de méxico", "cancún", "cancun", "playa del carmen", "guadalajara", "monterrey", "oaxaca", "tulum", "puerto vallarta"], code: "MXN" },
  { keys: ["argentina", "buenos aires", "mendoza", "patagonia", "bariloche", "córdoba", "cordoba", "rosario", "salta", "iguazú", "iguazu", "ushuaia"], code: "ARS" },
  { keys: ["brasil", "brazil", "rio de janeiro", "são paulo", "sao paulo", "salvador", "brasilia", "fortaleza", "florianópolis", "iguazú brasil"], code: "BRL" },
  { keys: ["chile", "santiago de chile", "santiago", "valparaíso", "valparaiso", "atacama", "punta arenas", "torres del paine"], code: "CLP" },
  { keys: ["perú", "peru", "lima", "cusco", "cuzco", "machu picchu", "arequipa"], code: "PEN" },
  { keys: ["colombia", "bogotá", "bogota", "medellín", "medellin", "cartagena", "cali"], code: "COP" },
  { keys: ["ecuador", "quito", "galápagos", "galapagos", "guayaquil"], code: "USD" },
  { keys: ["uruguay", "montevideo", "punta del este"], code: "UYU" },
  { keys: ["paraguay", "asunción", "asuncion"], code: "PYG" },
  { keys: ["bolivia", "la paz", "santa cruz", "uyuni"], code: "BOB" },
  { keys: ["venezuela", "caracas"], code: "VES" },
  { keys: ["japón", "japan", "tokio", "tokyo", "kioto", "kyoto", "osaka", "okinawa", "hokkaido"], code: "JPY" },
  { keys: ["china", "pekin", "beijing", "shanghai", "cantón", "guangzhou", "hong kong", "hongkong", "macao", "macau", "sichuan"], code: "CNY" },
  { keys: ["corea", "korea", "seúl", "seoul", "busan"], code: "KRW" },
  { keys: ["taiwán", "taiwan", "taipei"], code: "TWD" },
  { keys: ["tailandia", "thailand", "bangkok", "phuket", "chiang mai", "krabi"], code: "THB" },
  { keys: ["vietnam", "viet nam", "hanoi", "hanói", "ho chi minh", "saigon"], code: "VND" },
  { keys: ["indonesia", "yakarta", "jakarta", "bali", "ubud", "lombok"], code: "IDR" },
  { keys: ["malasia", "malaysia", "kuala lumpur", "penang", "langkawi"], code: "MYR" },
  { keys: ["singapur", "singapore"], code: "SGD" },
  { keys: ["filipinas", "philippines", "manila", "cebu", "palawan"], code: "PHP" },
  { keys: ["india", "delhi", "mumbai", "bangalore", "bengaluru", "jaipur", "goa", "rajasthan"], code: "INR" },
  { keys: ["australia", "sydney", "melbourne", "brisbane", "perth", "cairns", "uluru"], code: "AUD" },
  { keys: ["nueva zelanda", "new zealand", "auckland", "queenstown", "wellington"], code: "NZD" },
  { keys: ["marruecos", "morocco", "marrakech", "casablanca", "fez", "fes", "chefchaouen"], code: "MAD" },
  { keys: ["túnez", "tunisia", "tunis"], code: "TND" },
  { keys: ["egipto", "egypt", "cairo", "el cairo", "luxor", "hurghada"], code: "EGP" },
  { keys: ["turquía", "turkey", "estambul", "istanbul", "antalya", "capadocia", "cappadocia"], code: "TRY" },
  { keys: ["israel", "tel aviv", "jerusalén", "jerusalem"], code: "ILS" },
  { keys: ["emiratos", "uae", "dubai", "abu dhabi", "dubái"], code: "AED" },
  { keys: ["arabia saudí", "saudi", "riyadh", "jeddah"], code: "SAR" },
  { keys: ["qatar", "doha"], code: "QAR" },
  { keys: ["rusia", "russia", "moscú", "moscow", "san petersburgo", "st petersburg"], code: "RUB" },
  { keys: ["ucrania", "ukraine", "kiev", "kyiv", "lviv", "odessa"], code: "UAH" },
  { keys: ["polonia", "poland", "varsovia", "warsaw", "krakow", "cracovia", "gdansk"], code: "PLN" },
  { keys: ["república checa", "czech", "praga", "prague"], code: "CZK" },
  { keys: ["hungría", "hungary", "budapest"], code: "HUF" },
  { keys: ["rumanía", "romania", "bucharest", "bucarest", "transilvania"], code: "RON" },
  { keys: ["suecia", "sweden", "estocolmo", "stockholm", "gotemburgo"], code: "SEK" },
  { keys: ["noruega", "norway", "oslo", "bergen", "tromso", "lofoten"], code: "NOK" },
  { keys: ["dinamarca", "denmark", "copenhague", "copenhagen"], code: "DKK" },
  { keys: ["islandia", "iceland", "reykjavik", "reikiavik"], code: "ISK" },
  { keys: ["sudáfrica", "south africa", "ciudad del cabo", "cape town", "johannesburg", "kruger"], code: "ZAR" },
  { keys: ["costa rica", "san josé costa", "manuel antonio", "la fortuna", "arenal"], code: "CRC" },
  { keys: ["panamá", "panama", "ciudad de panamá"], code: "PAB" },
  { keys: ["cuba", "la habana", "havana", "varadero"], code: "CUP" },
  { keys: ["república dominicana", "dominicana", "punta cana", "santo domingo"], code: "DOP" },
  { keys: ["jamaica", "kingston", "negril", "montego bay"], code: "JMD" },
  { keys: ["bahamas", "nassau"], code: "BSD" },
  { keys: ["belice", "belize"], code: "BZD" },
  { keys: ["barbados", "bridgetown"], code: "BBD" },
  { keys: ["trinidad", "tobago", "port of spain"], code: "TTD" },
];

function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "");
}

/**
 * Códigos sugeridos por el texto de destino (lugares), en orden de aparición de reglas.
 */
export function suggestCurrencyCodesFromDestination(destinationHint: string): string[] {
  const norm = normalizeForMatch(destinationHint);
  if (!norm.trim()) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const rule of DESTINATION_CURRENCY_RULES) {
    if (!ALLOWED.has(rule.code)) continue;
    const hit = rule.keys.some((k) => norm.includes(normalizeForMatch(k)));
    if (hit && !seen.has(rule.code)) {
      seen.add(rule.code);
      out.push(rule.code);
    }
  }
  return out;
}

export type TravelCurrencyOption = { code: string; label: string };

/**
 * Opciones para `<select>`: primero monedas que encajan con el destino (★ en etiqueta), luego populares.
 * Solo monedas del allowlist activo.
 */
export function buildTravelCurrencySelectOptions(destinationHint: string): TravelCurrencyOption[] {
  const hinted = suggestCurrencyCodesFromDestination(destinationHint);
  const rest = POPULAR_TRAVEL_ORDER.filter((c) => ALLOWED.has(c) && !hinted.includes(c));
  const ordered = [...hinted, ...rest];

  const dn =
    typeof Intl !== "undefined" && typeof (Intl as any).DisplayNames === "function"
      ? new (Intl as any).DisplayNames(["es-ES"], { type: "currency" })
      : null;

  return ordered.map((code) => {
    const name = dn ? String(dn.of(code) || code) : code;
    const star = hinted.includes(code) ? "★ " : "";
    return { code, label: `${star}${code} · ${name}` };
  });
}

/** Asegura que el código guardado siga siendo elegible; si no, devuelve fallback. */
export function coerceTravelCurrencyCode(current: string | undefined | null, fallback = "EUR"): string {
  const c = typeof current === "string" ? current.trim().toUpperCase() : "";
  if (c.length === 3 && ALLOWED.has(c)) return c;
  return fallback;
}
