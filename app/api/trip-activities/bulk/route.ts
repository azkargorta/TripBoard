import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";
import { safeInsertAudit } from "@/lib/audit";
import { geocodePhotonPreferred, geocodeTripAnchor, regionHintsFromDestination } from "@/lib/geocoding/photonGeocode";

export const runtime = "nodejs";
export const maxDuration = 60;

function cleanString(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s : null;
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function coordsValid(lat: number | null, lng: number | null): boolean {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Math.abs(lat) > 0.001 &&
    Math.abs(lng) > 0.001 &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

type BulkActivityInput = {
  title: string;
  description?: string | null;
  activity_date?: string | null;
  activity_time?: string | null;
  place_name?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  activity_type?: string | null;
  activity_kind?: string | null;
  source?: string | null;
};

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const tripId = typeof body?.tripId === "string" ? body.tripId : body?.trip_id;
    const activities = Array.isArray(body?.activities) ? (body.activities as BulkActivityInput[]) : [];

    if (!tripId) return NextResponse.json({ error: "Falta tripId" }, { status: 400 });
    if (!activities.length) return NextResponse.json({ error: "Faltan activities" }, { status: 400 });

    const access = await requireTripAccess(String(tripId));
    if (!access.can_manage_plan) return NextResponse.json({ error: "No tienes permisos." }, { status: 403 });

    const supabase = await createClient();
    const { data: actor } = await supabase.auth.getUser();

    // Fetch trip destination for geocode anchor (improves accuracy)
    const { data: tripRow } = await supabase
      .from("trips")
      .select("destination")
      .eq("id", tripId)
      .maybeSingle();
    const tripDestination = typeof tripRow?.destination === "string" ? tripRow.destination : null;
    const anchor = await geocodeTripAnchor(tripDestination);
    const regionHints = regionHintsFromDestination(tripDestination);

    // Build initial rows
    const rows = activities
      .map((a) => {
        const title = cleanString((a as any)?.title);
        if (!title) return null;
        return {
          trip_id: tripId,
          title,
          description: cleanString((a as any)?.description),
          activity_date: cleanString((a as any)?.activity_date),
          activity_time: cleanString((a as any)?.activity_time),
          place_name: cleanString((a as any)?.place_name),
          address: cleanString((a as any)?.address),
          latitude: numOrNull((a as any)?.latitude),
          longitude: numOrNull((a as any)?.longitude),
          activity_type: cleanString((a as any)?.activity_type) ?? "general",
          activity_kind: cleanString((a as any)?.activity_kind) ?? "visit",
          source: cleanString((a as any)?.source) ?? "ai_planner",
          created_by_user_id: access.userId,
        };
      })
      .filter(Boolean) as any[];

    if (!rows.length) return NextResponse.json({ error: "No hay filas válidas para insertar." }, { status: 400 });

    // ── Geocode fallback for rows with null/zero coordinates ──────────────────
    // Run in parallel — only rows that need it get a geocode call.
    // Uses place_name or title + city as the query so Gemini-generated names resolve well.
    await Promise.all(
      rows.map(async (row: any) => {
        if (coordsValid(row.latitude, row.longitude)) return; // already has good coords
        if (row.activity_kind === "transport") return;         // transit rows intentionally have no coords

        const query = cleanString(row.place_name || row.title);
        if (!query) return;

        try {
          const g = await geocodePhotonPreferred(query, {
            anchor,
            regionHints,
            maxDistanceKm: 50000,
          });
          if (g && coordsValid(g.lat, g.lng)) {
            row.latitude = g.lat;
            row.longitude = g.lng;
            // Also improve address if we only had the raw title
            if (!row.address && g.label) row.address = g.label;
          }
        } catch {
          // Geocode failed — leave null, not a blocker
        }
      })
    );

    const { data, error } = await supabase.from("trip_activities").insert(rows).select("id, title");
    if (error) throw new Error(error.message || "No se pudieron crear actividades.");

    await safeInsertAudit(supabase, {
      trip_id: String(tripId),
      entity_type: "activity",
      entity_id: "bulk",
      action: "create",
      summary: `Creó ${rows.length} planes automáticamente`,
      diff: { count: rows.length },
      actor_user_id: actor?.user?.id ?? null,
      actor_email: actor?.user?.email ?? null,
    });

    return NextResponse.json({ ok: true, created: (data || []).length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudieron crear actividades." }, { status: 500 });
  }
}
