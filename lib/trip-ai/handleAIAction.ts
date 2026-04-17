import type { ParsedAction } from "@/lib/trip-ai/actions";
import { detectAction, executeAction } from "@/lib/trip-ai/actions";
import type { AIActionId } from "@/lib/trip-ai/aiActions";
import type { TripAiMode } from "@/lib/trip-ai/buildPrompt";

function mapToParsedAction(aiAction: AIActionId, question: string, mode: TripAiMode): ParsedAction {
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
      return "Objetivo: proponer itinerario por días con JSON ejecutable según las instrucciones del modo planificación.";
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
