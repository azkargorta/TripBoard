import type { ParsedAction } from "@/lib/trip-ai/actions";
import { detectAction, executeAction } from "@/lib/trip-ai/actions";
import type { AIActionId } from "@/lib/trip-ai/aiActions";
import type { TripAiMode } from "@/lib/trip-ai/buildPrompt";

function mapToParsedAction(aiAction: AIActionId, question: string, mode: TripAiMode): ParsedAction {
  if (aiAction === "route_legs") {
    return { type: "none" };
  }
  if (aiAction === "optimize_route") {
    return { type: "optimizer_summary" };
  }
  if (aiAction === "add_activity") {
    return detectAction(question, "actions");
  }
  if (aiAction === "adjust_budget") {
    return detectAction(question, "expenses");
  }
  if (aiAction === "parse_booking") {
    return { type: "none" };
  }
  if (aiAction === "generate_trip") {
    return { type: "none" };
  }
  return detectAction(question, mode);
}

export type HandleAIActionResult = {
  executedMessage: string | null;
  parsedAction: ParsedAction;
};

/**
 * Capa fina sobre acciones ya existentes: ejecuta mutaciones cuando corresponde y devuelve feedback para el prompt.
 */
export async function handleAIAction(
  tripId: string,
  aiAction: AIActionId,
  question: string,
  mode: TripAiMode
): Promise<HandleAIActionResult> {
  const parsedAction = mapToParsedAction(aiAction, question, mode);
  const executedMessage = await executeAction(tripId, parsedAction);
  return { executedMessage, parsedAction };
}

export function actionPromptHint(aiAction: AIActionId): string {
  switch (aiAction) {
    case "parse_booking":
      return [
        "El usuario habla de reservas/documentos: indica que puede subir PDFs o fotos en la pestaña «Docs» del viaje para OCR y parsing.",
        "No inventes datos de reservas que no estén en el resumen.",
      ].join(" ");
    case "generate_trip":
      return [
        "Objetivo: proponer itinerario por días con JSON ejecutable según las instrucciones del modo planificación.",
        "Si el destino puede ser varios países, aclara primero con el usuario; en JSON usa siempre place_name/address con país inequívoco.",
        "Si el usuario acaba de crear el viaje desde el dashboard con «Cuéntame tu viaje», el plan base ya puede existir: prioriza ajustes y refinamiento sin repetir todo el calendario salvo que lo pida.",
      ].join(" ");
    case "route_legs":
      return [
        "El usuario quiere rutas entre paradas del plan (mapa).",
        "Usa el contexto de actividades existentes (mismas fechas y orden).",
        "Devuelve un diff con operaciones `create_route` entre pares consecutivos del mismo día cuando tengan coordenadas o dirección geocodificable.",
        "travel_mode: WALKING si el tramo es corto; si el usuario pide transporte público o el trayecto a pie sería largo (>30 min aprox.), usa TRANSIT y acláralo en notes.",
        "path_points y route_points pueden ser [] si no calculas geometría; la app puede recalcular al aplicar.",
      ].join(" ");
    case "optimize_route":
      return "Prioriza orden geográfico, tiempos de desplazamiento y coherencia entre actividades y rutas existentes.";
    case "adjust_budget":
      return "Prioriza números reales del resumen, balances y ideas prácticas de ahorro o reparto.";
    case "add_activity":
      return "Si propones nuevas actividades aplicables, puedes usar el formato diff del modo acciones cuando convenga.";
    default:
      return "";
  }
}
