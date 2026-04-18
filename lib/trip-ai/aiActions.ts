import type { TripAiMode } from "@/lib/trip-ai/buildPrompt";

export const AI_ACTION_IDS = [
  "generate_trip",
  "route_legs",
  "optimize_route",
  "add_activity",
  "adjust_budget",
  "parse_booking",
  "general_chat",
] as const;

export type AIActionId = (typeof AI_ACTION_IDS)[number];

function normalize(input: string) {
  return input.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function parseClientAIAction(input: unknown): AIActionId | null {
  if (typeof input !== "string") return null;
  const v = input.trim() as AIActionId;
  return (AI_ACTION_IDS as readonly string[]).includes(v) ? v : null;
}

/**
 * Clasificación ligera por texto (sin modelo). El servidor puede recibir además `aiAction` explícito desde chips.
 */
export function inferAIActionFromQuestion(question: string): AIActionId {
  const q = normalize(question);

  if (
    q.includes("reserva") ||
    q.includes("boarding") ||
    (q.includes("vuelo") && (q.includes("pdf") || q.includes("ocr") || q.includes("documento")))
  ) {
    return "parse_booking";
  }
  if (
    q.includes("presupuesto") ||
    q.includes("gasto") ||
    q.includes("balance") ||
    q.includes("dinero") ||
    q.includes("presu")
  ) {
    return "adjust_budget";
  }
  // Rutas nuevas entre paradas (diff `create_route`). Debe ir ANTES del filtro genérico «ruta» del optimizador.
  if (
    q.includes("crear ruta") ||
    q.includes("crees ruta") ||
    q.includes("crear rutas") ||
    q.includes("crees rutas") ||
    q.includes("creame rutas") ||
    q.includes("me crees rutas") ||
    q.includes("haz rutas") ||
    q.includes("hazme rutas") ||
    q.includes("rutas entre") ||
    q.includes("ruta entre") ||
    q.includes("rutas del plan") ||
    q.includes("rutas en el mapa") ||
    q.includes("conectar paradas") ||
    q.includes("unir paradas") ||
    (q.includes("de un lado a otro") && (q.includes("ruta") || q.includes("rutas")))
  ) {
    return "route_legs";
  }
  if (
    q.includes("mapa") ||
    q.includes("desplaz") ||
    q.includes("orden de visitas") ||
    (q.includes("optimiza") && (q.includes("ruta") || q.includes("rutas") || q.includes("plan"))) ||
    (q.includes("mejorar") && (q.includes("ruta") || q.includes("rutas"))) ||
    (q.includes("mejora ") && (q.includes("ruta") || q.includes("rutas")))
  ) {
    return "optimize_route";
  }
  if (q.includes("optimiza") || q.includes("mejorar viaje") || q.includes("hueco")) {
    return "optimize_route";
  }
  if (
    q.includes("restaurante") ||
    q.includes("anade actividad") ||
    q.includes("añade actividad") ||
    q.includes("crear actividad") ||
    q.includes("agregar actividad")
  ) {
    return "add_activity";
  }
  // Itinerario / plan por días → modo planificación + JSON TRIPBOARD_ITINERARY (aunque el UI esté en «general»).
  if (
    q.includes("planning") ||
    q.includes("planing") ||
    q.includes("planificacion") ||
    q.includes("planificar") ||
    q.includes("itinerario") ||
    q.includes("cronograma") ||
    q.includes("dia a dia") ||
    q.includes("day by day") ||
    (q.includes("schedule") && (q.includes("trip") || q.includes("days") || q.includes("itinerary"))) ||
    q.includes("itinerary") ||
    q.includes("plan de ") ||
    q.includes("dias en") ||
    q.includes("genera el viaje") ||
    q.includes("generame el viaje") ||
    q.includes("organiza el viaje") ||
    q.includes("organiza mi viaje") ||
    q.includes("organizame el viaje") ||
    q.includes("organizame un viaje") ||
    q.includes("monta el viaje") ||
    q.includes("montame el viaje") ||
    q.includes("programa el viaje") ||
    q.includes("calendario del viaje") ||
    q.includes("calendario de viaje") ||
    q.includes("propuesta de viaje") ||
    q.includes("borrador de itinerario") ||
    q.includes("hazme un plan") ||
    q.includes("me hagas un plan") ||
    q.includes("que me hagas un plan") ||
    q.includes("hagas un plan") ||
    q.includes("haceme un plan") ||
    q.includes("dame un plan") ||
    q.includes("crea un plan") ||
    q.includes("creame un plan") ||
    q.includes("quiero un plan") ||
    q.includes("necesito un plan") ||
    q.includes("haz un plan") ||
    q.includes("armame un viaje") ||
    q.includes("armame el viaje") ||
    q.includes("disena un viaje") ||
    q.includes("disenar un viaje") ||
    q.includes("disena un itinerario") ||
    q.includes("ruta por dias") ||
    q.includes("recorrido de varios dias")
  ) {
    return "generate_trip";
  }

  return "general_chat";
}

export function tripAiModeForAction(aiAction: AIActionId): TripAiMode {
  switch (aiAction) {
    case "generate_trip":
      return "planning";
    case "route_legs":
      return "optimizer";
    case "optimize_route":
      return "optimizer";
    case "add_activity":
      return "actions";
    case "adjust_budget":
      return "expenses";
    case "parse_booking":
      return "general";
    default:
      return "general";
  }
}

/**
 * Resuelve el modo efectivo: si el cliente envía un modo explícito (avanzado), se respeta; si no, se deriva de la acción.
 * Si la intención es itinerario ejecutable (`generate_trip`), siempre se usa `planning` (marcadores JSON), aunque el selector manual estuviera en otro modo.
 */
export function resolveEffectiveTripAiMode(params: {
  clientMode: TripAiMode | null | undefined;
  aiAction: AIActionId;
  respectExplicitMode: boolean;
}): TripAiMode {
  const explicit = params.clientMode;

  /** Modo documentación: no forzar itinerario aunque el texto parezca un «plan». */
  if (params.respectExplicitMode && explicit === "travel_docs") {
    return "travel_docs";
  }

  if (params.aiAction === "generate_trip") {
    return "planning";
  }
  if (params.aiAction === "route_legs") {
    return "optimizer";
  }
  if (params.respectExplicitMode && explicit && explicit !== "general") {
    return explicit;
  }
  return tripAiModeForAction(params.aiAction);
}
