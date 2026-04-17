/**
 * Superficie del viaje donde se muestra el asistente contextual (panel desplegable).
 * Las URLs siguen siendo `/trip/:id/map/*`; el nombre de producto de la pestaña es «Rutas».
 */
export type TripAssistantSurface = "plan" | "routes" | "expenses" | "resources" | "participants" | "summary";

export function tripAssistantSurfaceFromPathname(pathname: string | null): TripAssistantSurface | null {
  if (!pathname) return null;
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length < 3 || parts[0] !== "trip") return null;

  const seg = parts[2];
  if (seg === "ai-chat" || seg === "ai" || seg === "settings") return null;
  if (seg === "plan") return "plan";
  if (seg === "map") return "routes";
  if (seg === "expenses") return "expenses";
  if (seg === "resources") return "resources";
  if (seg === "participants") return "participants";
  if (seg === "summary" || seg === "overview") return "summary";

  return null;
}

export function tripAssistantSurfaceLabel(surface: TripAssistantSurface): string {
  switch (surface) {
    case "plan":
      return "Plan";
    case "routes":
      return "Rutas";
    case "expenses":
      return "Gastos";
    case "resources":
      return "Docs";
    case "participants":
      return "Gente";
    case "summary":
      return "Resumen";
    default:
      return "Viaje";
  }
}
