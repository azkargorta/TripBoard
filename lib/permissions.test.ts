import { describe, expect, it } from "vitest";
import { normalizePermissions, normalizeRole } from "@/lib/permissions";

describe("lib/permissions", () => {
  it("normalizeRole: devuelve viewer por defecto", () => {
    expect(normalizeRole(null)).toBe("viewer");
    expect(normalizeRole(undefined)).toBe("viewer");
    expect(normalizeRole("")).toBe("viewer");
    expect(normalizeRole("admin")).toBe("viewer");
  });

  it("normalizeRole: permite owner/editor/viewer", () => {
    expect(normalizeRole("owner")).toBe("owner");
    expect(normalizeRole("editor")).toBe("editor");
    expect(normalizeRole("viewer")).toBe("viewer");
  });

  it("normalizePermissions: aplica defaults por rol + overrides", () => {
    const editor = normalizePermissions("editor", null);
    expect(editor.can_manage_expenses).toBe(true);
    expect(editor.can_manage_participants).toBe(false);

    const overridden = normalizePermissions("viewer", { can_manage_expenses: true, can_manage_plan: true });
    expect(overridden.can_manage_expenses).toBe(true);
    expect(overridden.can_manage_plan).toBe(true);
    expect(overridden.can_manage_map).toBe(false);
  });
});

