import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => {
  return {
    NextResponse: {
      json: (data: any, init?: ResponseInit) =>
        new Response(JSON.stringify(data), {
          status: init?.status ?? 200,
          headers: { "content-type": "application/json" },
        }),
    },
  };
});

const safeInsertAudit = vi.fn(async () => undefined);
vi.mock("@/lib/audit", () => ({ safeInsertAudit }));

const requireTripAccess = vi.fn();
vi.mock("@/lib/trip-access", () => ({ requireTripAccess }));

const createClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient }));

function makeSupabaseMock() {
  const from = vi.fn((table: string) => {
    if (table === "trip_routes") {
      return {
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: { id: "r1", title: "Ruta 1" }, error: null })),
          })),
        })),
      };
    }
    if (table === "trip_audit_log") {
      return { insert: vi.fn(async () => ({ data: null, error: null })) };
    }
    return {};
  });

  return {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: "u1", email: "a@b.com" } } })) },
    from,
  };
}

async function readJson(resp: Response) {
  const text = await resp.text();
  return text ? JSON.parse(text) : null;
}

describe("POST /api/trip-routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve 403 si no tiene can_manage_map", async () => {
    requireTripAccess.mockResolvedValueOnce({
      userId: "u1",
      participantId: "p1",
      tripId: "t1",
      role: "viewer",
      can_manage_map: false,
      can_manage_trip: false,
      can_manage_participants: false,
      can_manage_expenses: false,
      can_manage_plan: false,
      can_manage_resources: false,
    });
    createClient.mockResolvedValueOnce(makeSupabaseMock());

    const { POST } = await import("../trip-routes/route");
    const req = new Request("http://localhost/api/trip-routes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tripId: "t1", title: "Ruta 1" }),
    });

    const resp = await POST(req);
    expect(resp.status).toBe(403);
    const payload = await readJson(resp);
    expect(String(payload?.error || "")).toMatch(/permisos/i);
    expect(safeInsertAudit).not.toHaveBeenCalled();
  });

  it("inserta ruta y llama a safeInsertAudit cuando hay permisos", async () => {
    requireTripAccess.mockResolvedValueOnce({
      userId: "u1",
      participantId: "p1",
      tripId: "t1",
      role: "editor",
      can_manage_map: true,
      can_manage_trip: false,
      can_manage_participants: false,
      can_manage_expenses: true,
      can_manage_plan: true,
      can_manage_resources: true,
    });
    createClient.mockResolvedValueOnce(makeSupabaseMock());

    const { POST } = await import("../trip-routes/route");
    const req = new Request("http://localhost/api/trip-routes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tripId: "t1", title: "Ruta 1" }),
    });

    const resp = await POST(req);
    expect(resp.status).toBe(200);
    const payload = await readJson(resp);
    expect(payload?.route?.id).toBe("r1");
    expect(safeInsertAudit).toHaveBeenCalledTimes(1);
  });
});

