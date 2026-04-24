import { describe, expect, it } from "vitest";
import type { TripAutoConfig } from "@/lib/trip-ai/tripAutoConfig";
import { deriveRouteStructure } from "@/lib/trip-ai/routeStructure";

describe("deriveRouteStructure", () => {
  const baseResolved: any = {
    destination: "Argentina",
    startDate: "2026-11-05",
    durationDays: 6,
    intent: {
      startLocation: "Buenos Aires",
      endLocation: "Ushuaia",
      mustSee: ["Mendoza", "El Calafate"],
    },
  };

  const cfg: TripAutoConfig = {
    pace: { itemsPerDayMin: 3, itemsPerDayMax: 5 },
    geo: { strictness: "balanced" },
    transport: { notes: "" },
    lodging: { mode: "proposal", baseCityMode: "rotate", baseCity: "" },
    routes: { enabled: true },
  };

  it("respeta baseCityMode=single", async () => {
    const s = await deriveRouteStructure({
      resolved: baseResolved,
      config: { ...cfg, lodging: { ...cfg.lodging, baseCityMode: "single", baseCity: "Buenos Aires" } },
    });
    expect(s.baseCityByDay).toHaveLength(6);
    expect(new Set(s.baseCityByDay)).toEqual(new Set(["Buenos Aires"]));
    expect(s.segments.length).toBe(1);
  });

  it("genera segmentos y baseCityByDay con longitud exacta", async () => {
    // Geocoder inyectado para evitar red
    const fakeGeo = async (q: string) => {
      const label = q.split(",")[0]!.trim();
      const map: Record<string, { lat: number; lng: number }> = {
        "Buenos Aires": { lat: -34.6, lng: -58.38 },
        Mendoza: { lat: -32.89, lng: -68.84 },
        "El Calafate": { lat: -50.34, lng: -72.27 },
        Ushuaia: { lat: -54.8, lng: -68.3 },
        Argentina: { lat: -38.4, lng: -63.6 },
      };
      const hit = map[label] || map["Argentina"]!;
      return { label, ...hit };
    };

    const s = await deriveRouteStructure({
      resolved: baseResolved,
      config: cfg,
      geocode: async (q) => fakeGeo(q),
    });
    expect(s.version).toBe(1);
    expect(s.baseCityByDay).toHaveLength(6);
    expect(s.segments.length).toBeGreaterThanOrEqual(1);
    expect(s.segments[0]!.startDate).toBe("2026-11-05");
  });
});

