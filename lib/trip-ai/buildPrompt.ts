export type TripAiMode = "general" | "planning" | "expenses" | "optimizer" | "actions";

export function buildTripPrompt(context: string, question: string, mode: TripAiMode) {
  const modeInstructions: Record<TripAiMode, string> = {
    general: "Responde como asistente general del viaje.",
    planning: "Prioriza planificación diaria, orden de visitas, tiempos y recomendaciones prácticas.",
    expenses: "Prioriza gastos, balances, pagos pendientes y sugerencias para repartir o ahorrar.",
    optimizer: "Actúa como optimizador del viaje. Detecta huecos, conflictos, excesos de desplazamiento y mejoras de organización.",
    actions: "Si el usuario pide ejecutar algo, explica claramente qué vas a hacer y qué efecto tendrá.",
  };

  return [
    "Eres un asistente experto de viajes dentro de TripBoard.",
    "Responde siempre en español.",
    "Debes usar prioritariamente el contexto real del viaje proporcionado.",
    "Si falta información, dilo claramente.",
    "No inventes reservas, importes, rutas ni actividades que no estén en el contexto.",
    "Sé práctico, útil y claro.",
    "Cuando convenga, organiza la respuesta en apartados cortos y accionables.",
    modeInstructions[mode],
    "",
    "CONTEXTO DEL VIAJE:",
    context,
    "",
    "PREGUNTA DEL USUARIO:",
    question,
    "",
    "RESPUESTA:",
  ].join("\n");
}
