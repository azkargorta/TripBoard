import { describe, expect, it } from "vitest";
import { activityLikelyNeedsTicket } from "./trip-plan-ticket-hints";

describe("activityLikelyNeedsTicket", () => {
  it("no marca toda actividad genérica", () => {
    expect(
      activityLikelyNeedsTicket({
        activity_kind: "activity",
        title: "Paseo por el centro",
        place_name: "Madrid",
      })
    ).toBe(false);
  });

  it("detecta museo por tipo", () => {
    expect(
      activityLikelyNeedsTicket({
        activity_kind: "museum",
        title: "Colección permanente",
      })
    ).toBe(true);
  });

  it("detecta visita con nombre de museo en texto", () => {
    expect(
      activityLikelyNeedsTicket({
        activity_kind: "visit",
        title: "Tarde en el Prado",
        place_name: "Museo del Prado",
      })
    ).toBe(true);
  });

  it("excluye playa / senderismo aunque sea activity", () => {
    expect(
      activityLikelyNeedsTicket({
        activity_kind: "activity",
        title: "Senderismo en la playa",
      })
    ).toBe(false);
  });

  it("detecta concierto", () => {
    expect(
      activityLikelyNeedsTicket({
        activity_kind: "activity",
        title: "Concierto en el WiZink Center",
      })
    ).toBe(true);
  });
});
