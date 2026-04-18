/**
 * Heurística Premium: actividades que suelen requerir entrada o reserva previa.
 * El enlace «Entrada» abre una búsqueda orientada a encontrar la venta oficial (el usuario debe verificar la URL).
 */

const TICKET_KEYWORDS =
  /\b(museo|museum|monument|monumento|castillo|alcaz|alcázar|catedral|bas[ií]lica|coliseo|acuario|aquarium|zoo|parque temático|parque tematico|giardini|versailles|alhambra|sagrada|uffizi|rijks|vatican|vaticano|louvre|prado|güell|park güell|entrada|entradas|ticket|tickets|billet|audio\s?guide|visita guiada|palacio real|palacio|torre eiffel|eiffel)\b/i;

export type TicketHintActivity = {
  activity_kind?: string | null;
  title?: string | null;
  description?: string | null;
  place_name?: string | null;
  address?: string | null;
};

export function activityLikelyNeedsTicket(activity: TicketHintActivity): boolean {
  const kind = (activity.activity_kind || "").toLowerCase();
  if (kind === "museum") return true;
  if (kind === "activity") return true;
  if (kind === "visit") {
    const hay = `${activity.title || ""} ${activity.place_name || ""} ${activity.description || ""}`;
    return TICKET_KEYWORDS.test(hay);
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
