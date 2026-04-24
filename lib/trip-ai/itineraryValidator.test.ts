import { describe, expect, it, vi } from "vitest";
import { validateAndRepairItinerary } from "@/lib/trip-ai/itineraryValidator";

// Mock geocoding to avoid network
vi.mock("@/lib/geocoding/photonGeocode", async () => {
  return {
    geocodeTripAnchor: async () => ({ lat: -34.6, lng: -58.38 }),
    regionHintsFromDestination: () => ["argentina"],
    geocodePhotonPreferred: async (q: string) => {
      const s = q.toLowerCase();
      // If query contains "argentina" -> return Argentina label, otherwise pretend it's in Spain
      if (s.includes("argentina")) return { lat: -34.6, lng: -58.38, label: "Buenos Aires, Argentina" };
      return { lat: 40.4, lng: -3.7, label: "Madrid, España" };
    },
  };
});

describe("validateAndRepairItinerary", () => {
  it("repara items que geocodifican fuera del país", async () => {
    const itinerary: any = {
      version: 1,
      title: "Test",
      travelMode: "driving",
      days: [
        {
          day: 1,
          date: "2026-11-05",
          items: [
            { title: "Calle Venecia", activity_kind: "visit", place_name: "Calle Venecia", address: null, start_time: "10:00" },
          ],
        },
      ],
    };

    const out = await validateAndRepairItinerary({
      itinerary,
      destination: "Argentina",
      baseCityByDay: ["Buenos Aires"],
      strictness: "balanced",
    });
    const addr = String(out.itinerary.days[0]!.items[0]!.address || "").toLowerCase();
    expect(addr).toContain("argentina");
  });
});

