import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";
import { askGemini } from "@/lib/trip-ai/providers";
import { extractJsonObject } from "@/lib/trip-ai/tripCreationJson";

export const runtime = "nodejs";
export const maxDuration = 60;

export type PackingCategory = {
  name: string;
  emoji: string;
  items: Array<{ item: string; qty: string | null; note: string | null }>;
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tripId = searchParams.get("tripId") ?? "";
    if (!tripId) return NextResponse.json({ error: "Falta tripId" }, { status: 400 });

    await requireTripAccess(tripId);
    const supabase = await createClient();

    const [{ data: trip }, { data: activities }] = await Promise.all([
      supabase.from("trips").select("destination, start_date, end_date").eq("id", tripId).maybeSingle(),
      supabase.from("trip_activities").select("activity_kind, title").eq("trip_id", tripId).limit(60),
    ]);

    const destination = trip?.destination?.trim() || "destino desconocido";
    const startDate = trip?.start_date || null;
    const endDate = trip?.end_date || null;
    const nights = startDate && endDate
      ? Math.max(1, Math.round((new Date(`${endDate}T12:00:00Z`).getTime() - new Date(`${startDate}T12:00:00Z`).getTime()) / (86400 * 1000)))
      : 7;

    // Summarize activity kinds for context
    const kindCounts: Record<string, number> = {};
    for (const a of (activities || [])) {
      const k = a.activity_kind || "visit";
      kindCounts[k] = (kindCounts[k] || 0) + 1;
    }
    const activityContext = Object.entries(kindCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${k}(${n})`)
      .join(", ");

    const prompt = `Eres un experto en viajes. Genera una lista de maleta para:
- Destino: ${destination}
- Duración: ${nights} noches
- Actividades principales: ${activityContext || "turismo general"}
- Salida: ${startDate || "próximamente"}

Devuelve SOLO JSON válido (sin markdown):
{
  "categories": [
    {
      "name": "Documentación",
      "emoji": "📄",
      "items": [
        { "item": "Pasaporte", "qty": "1", "note": "Vigencia mínima 6 meses" }
      ]
    }
  ]
}

Genera entre 6 y 8 categorías. Ejemplos de categorías: Documentación, Ropa, Calzado, Higiene y salud, Electrónica, Medicamentos, Actividades específicas, Extras.
Cada categoría: 4-8 ítems concretos y relevantes para ESTE viaje específico.
Si hay senderismo → botas. Si hay playa → bañador, crema solar. Si hay cultura → ropa elegante para algún sitio.
Adapta qty y note al contexto real del viaje.`;

    const raw = await askGemini(prompt, "planning", { maxOutputTokens: 2048 });
    const parsed = extractJsonObject(raw) as { categories: PackingCategory[] } | null;
    if (!parsed?.categories) return NextResponse.json({ error: "No se pudo generar la lista." }, { status: 500 });

    return NextResponse.json({ ok: true, categories: parsed.categories, destination, nights });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error generando lista." }, { status: 500 });
  }
}
