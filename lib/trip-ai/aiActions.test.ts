import { describe, expect, it } from "vitest";
import { inferAIActionFromQuestion, resolveEffectiveTripAiMode, tripAiModeForAction } from "./aiActions";

describe("inferAIActionFromQuestion", () => {
  it("detecta peticiones de planning aunque el usuario diga «planning»", () => {
    expect(inferAIActionFromQuestion("Hazme un planning para Roma")).toBe("generate_trip");
  });

  it("detecta el typo «planing» y «que me hagas un plan»", () => {
    expect(inferAIActionFromQuestion("quiero que me hagas un planing de que ver en londres esos dias")).toBe(
      "generate_trip"
    );
    expect(inferAIActionFromQuestion("Quiero que me hagas un plan para el finde")).toBe("generate_trip");
  });

  it("detecta «planificación» y variantes de plan", () => {
    expect(inferAIActionFromQuestion("Necesito planificación 4 días Lisboa")).toBe("generate_trip");
    expect(inferAIActionFromQuestion("Dame un plan de fin de semana")).toBe("generate_trip");
  });

  it("deja general_chat para saludos sin intención de itinerario", () => {
    expect(inferAIActionFromQuestion("Hola")).toBe("general_chat");
  });
});

describe("resolveEffectiveTripAiMode", () => {
  it("con modo manual «general» y acción generate_trip usa planning (JSON itinerario)", () => {
    expect(
      resolveEffectiveTripAiMode({
        clientMode: "general",
        aiAction: "generate_trip",
        respectExplicitMode: true,
      })
    ).toBe("planning");
  });

  it("prioriza planning para generate_trip aunque el selector manual esté en optimizador", () => {
    expect(
      resolveEffectiveTripAiMode({
        clientMode: "optimizer",
        aiAction: "generate_trip",
        respectExplicitMode: true,
      })
    ).toBe("planning");
  });

  it("tripAiModeForAction enlaza generate_trip → planning", () => {
    expect(tripAiModeForAction("generate_trip")).toBe("planning");
  });
});
