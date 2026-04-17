import type { TripAiMode } from "@/lib/trip-ai/buildPrompt";

export const AI_ACTION_IDS = [
  "generate_trip",
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
  if (
    q.includes("ruta") ||
    q.includes("mapa") ||
    q.includes("desplaz") ||
    q.includes("orden de visitas") ||
    (q.includes("optimiza") && (q.includes("ruta") || q.includes("plan")))
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
  if (
    q.includes("itinerario") ||
    q.includes("plan de ") ||
    q.includes("dias en") ||
    q.includes("días en") ||
    q.includes("genera el viaje") ||
    q.includes("organiza el viaje")
  ) {
    return "generate_trip";
  }

  return "general_chat";
}

export function tripAiModeForAction(aiAction: AIActionId): TripAiMode {
  switch (aiAction) {
    case "generate_trip":
      return "planning";
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
 */
export function resolveEffectiveTripAiMode(params: {
  clientMode: TripAiMode | null | undefined;
  aiAction: AIActionId;
  respectExplicitMode: boolean;
}): TripAiMode {
  const explicit = params.clientMode;
  if (params.respectExplicitMode && explicit && explicit !== "general") {
    return explicit;
  }
  return tripAiModeForAction(params.aiAction);
}
