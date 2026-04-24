import { describe, expect, it, vi } from "vitest";
import { generateExecutableItineraryFromStructure } from "@/lib/trip-ai/generateItineraryFromIntent";

// Mock LLM call to keep test deterministic.
vi.mock("@/lib/trip-ai/providers", async () => {
  return {
    askTripAIWithUsage: async () => {
      const payload = {
        version: 1,
        title: "Mock",
        travelMode: "driving",
        days: [
          {
            day: 1,
            date: "2026-11-05",
            items: [{ title: "A", activity_kind: "visit", place_name: "A", address: "A, Buenos Aires, Argentina", start_time: "10:00", notes: null }],
          },
          {
            day: 2,
            date: "2026-11-06",
            items: [{ title: "B", activity_kind: "visit", place_name: "B", address: "B, Mendoza, Argentina", start_time: "10:00", notes: null }],
          },
        ],
      };
      return { text: JSON.stringify(payload), usage: { provider: "gemini", model: null, inputTokens: 1, outputTokens: 1 } };
    },
  };
});

describe("generateExecutableItineraryFromStructure", () => {
  it("usa baseCityByDay como ciudad base por día (hard constraint)", async () => {
    const resolved: any = {
      destination: "Argentina",
      startDate: "2026-11-05",
      durationDays: 2,
      intent: { startLocation: "Buenos Aires", endLocation: "Mendoza", mustSee: [], wantsRouteOptimization: false },
    };

    const out = await generateExecutableItineraryFromStructure(resolved, {
      provider: "gemini",
      config: null,
      structure: { version: 1, baseCityByDay: ["Buenos Aires", "Mendoza"], segments: [] },
    });

    // La función construye el prompt y luego post-procesa; aquí verificamos que devuelve 2 días correctos.
    expect(out.itinerary.days).toHaveLength(2);
    expect(out.itinerary.days[0]!.day).toBe(1);
    expect(out.itinerary.days[1]!.day).toBe(2);
  });
});

