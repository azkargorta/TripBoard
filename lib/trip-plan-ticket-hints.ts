/**
 * Heurística Premium: actividades que suelen requerir entrada o reserva previa.
 * El enlace «Entrada» abre una búsqueda orientada a encontrar la venta oficial (el usuario debe verificar la URL).
 */

export type TicketHintActivity = {
  activity_kind?: string | null;
  title?: string | null;
  description?: string | null;
  place_name?: string | null;
  address?: string | null;
};

function hintText(activity: TicketHintActivity): string {
  return `${activity.title || ""} ${activity.place_name || ""} ${activity.description || ""}`;
}

/**
 * Contextos que casi nunca son “comprar entrada” de recinto (falsos positivos frecuentes).
 */
const TICKET_HINT_EXCLUDE =
  /\b(senderismo|hiking|trekking|playa|beach|surf|kayak|snorkel|buceo|paddle|sup\b|rafting|escalada\b|vía ferrata|via ferrata|bicicleta|bici\b|cicloturismo|ruta\s+en\s+bici|paseo(?!\s+.*\b(museo|palacio|alcázar|alcazar|castillo|catedral))\b|paseo marítimo|paseo por el|paseo por la|caminata|sendero|mirador|barrio|neighbou?rhood|free\s*walking|tour\s+gratuito|walking\s+tour|compras|shopping|outlet|mercado(?!\s+.*\b(museo|entrada))\b|rastro|tiempo\s+libre|día\s+libre|opcional|optional|gratis|entrada\s+libre|sin\s+entrada|entrada\s+gratuita|libre\s+acceso|comida|cena|desayuno|brunch|tapas|restaur|café|cafe|cervecería|hotel|hostal|alojamiento|check-?in|vuelo|vuelos|tren\b|ave\b|bus\b|metro|ferry|taxi|traslado|trayecto|transporte|conductor|parking|aparcamiento|parque\s+nacional|national\s+park|reserva\s+natural|naturaleza)\b/giu;

/**
 * Recintos o formatos donde suele haber taquilla / reserva / venta oficial.
 * Evitamos palabras sueltas muy ambiguas (“palacio”, “monumento”, “entrada”) sin más contexto.
 */
const TICKET_HINT_INCLUDE =
  /\b(museo|museum|museums|galería|galeria|exposición|exposicion|pinacoteca|colección permanente|coleccion permanente|zoo\b|zoológico|zoologico|acuario|aquarium|dolphinarium|parque\s+temático|parque\s+tematico|themepark|disney|universal\s+studios|warner\b|portaventura|feria\b.*\b(entradas|atracciones)\b|castillo\b|château|chateau\b|fortaleza|fortress|alcázar|alcazar|catedral\b|basílica|basilica|coliseo|colosseum|foro\s+romano|pantheon|patheon|acrópolis|acropolis|anfiteatro|arena\b.*\b(roma|verona|nimes|nîmes)\b|palacio\s+real|versailles|versalles|schönbrunn|schonbrunn|hofburg|topkapi|topkapı|buckingham|winter\s+palace|hermitage|louvre|u\s*ffizi|uffizi|rijks|vatican|vaticano|museo\s+del\s+prado|museo\s+nacional|reina\s+sofía|reina sofia|thyssen|guggenheim|alhambra|generalife|sagrada\s*familia|gaudí|gaudi|park\s*güell|park\s*guell|tower\s+of\s+london|tower\s+bridge.*\b(ticket|entrada|visita)\b|torre\s+eiffel|eiffel\s+tower|tokyo\s+skytree|skytree|burj\s+khalifa|shard\b.*\b(entrada|ticket|view)\b|skydeck|observation\s+deck|mirador\s+.*\b(entrada|ticket|pago)\b|teatro\b.*\b(entrada|ticket|función|funcion|espectáculo)\b|theatre\b.*\b(ticket|show)\b|theater\b.*\b(ticket|show)\b|opera\s+house|ópera\b.*\b(entrada|ticket)|opera\b.*\b(ticket|entrada)|concierto|concert\b|recital\b|musical\b|ballet|espectáculo|show\b.*\b(entradas|tickets)|estadio\b.*\b(tour|visita|museum|entrada|ticket)|stadium\b.*\b(tour|ticket)|bernabéu|bernabeu|camp\s+nou|wembley|skip\s*the\s*line|salta\s*la\s*cola|timed\s+entry|entradas?\s+oficiales|comprar\s+entradas|buy\s+tickets|audioguía|audioguia|audio\s*guide|visita\s+guiada.*\b(museo|monumento|yacimiento|excavaciones|ruinas|acrópolis|castillo|catedral|palacio)\b|yacimiento|excavaciones|ruinas\b.*\b(entrada|ticket|visitas?)\b|city\s+pass|museum\s+pass|billets?\b|tickets?\s+online)\b/giu;

export function activityLikelyNeedsTicket(activity: TicketHintActivity): boolean {
  const kind = (activity.activity_kind || "").toLowerCase();
  const text = hintText(activity);

  if (TICKET_HINT_EXCLUDE.test(text) && !TICKET_HINT_INCLUDE.test(text)) {
    return false;
  }

  if (kind === "museum") {
    return true;
  }

  if (kind === "activity" || kind === "visit") {
    return TICKET_HINT_INCLUDE.test(text);
  }

  return false;
}

/** Búsqueda web para acercar al sitio oficial de venta de entradas (comprobar resultado). */
export function buildTicketOfficialSearchUrl(activity: TicketHintActivity): string {
  const parts = [activity.place_name, activity.title].filter((s): s is string => Boolean(s && String(s).trim()));
  const core = parts.join(" ").trim() || String(activity.title || "museo").trim();
  const query = `${core} comprar entrada sitio oficial`;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}
