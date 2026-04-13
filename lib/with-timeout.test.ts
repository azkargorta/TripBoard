import { describe, expect, it } from "vitest";
import { withTimeout } from "./with-timeout";

describe("withTimeout", () => {
  it("resuelve si la promesa termina a tiempo", async () => {
    await expect(withTimeout(Promise.resolve(7), 500, "timeout")).resolves.toBe(7);
  });
  it("rechaza con el mensaje indicado si vence el plazo", async () => {
    await expect(
      withTimeout(
        new Promise<number>(() => {
          /* nunca resuelve */
        }),
        30,
        "operación lenta"
      )
    ).rejects.toThrow("operación lenta");
  });
});
