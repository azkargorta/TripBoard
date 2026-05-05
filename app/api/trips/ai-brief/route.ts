import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireTripAccess } from "@/lib/trip-access";
import { askGemini } from "@/lib/trip-ai/providers";
import { extractJsonObject } from "@/lib/trip-ai/tripCreationJson";

export const runtime = "nodejs";
export const maxDuration = 60;

export type CountryBrief = {
  destination: string;
  currency: { code: string; symbol: string; tip: string };
  language: string;
  plugType: string;
  voltage: string;
  timeZone: string;
  tipping: string;
  visa: string;
  vaccinations: string;
  emergency: string;
  customs: string[];
  bestTime: string;
  transport: string;
};

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tripId = searchParams.get("tripId") ?? "";
    if (!tripId) return NextResponse.json({ error: "Falta tripId" }, { status: 400 });

    const access = await requireTripAccess(tripId);
    const supabase = await createClient();

    const { data: trip } = await supabase
      .from("trips")
      .select("destination, start_date")
      .eq("id", tripId)
      .maybeSingle();

    const destination = trip?.destination?.trim();
    if (!destination) return NextResponse.json({ error: "El viaje no tiene destino." }, { status: 400 });

    const prompt = `Eres un experto en viajes internacionales. Genera un brief de destino para: "${destination}".

Devuelve SOLO JSON válido (sin markdown):
{
  "destination": "${destination}",
  "currency": { "code": "EUR", "symbol": "€", "tip": "Tip sobre cambio o uso de efectivo" },
  "language": "Idioma principal + saludo básico útil",
  "plugType": "Tipo de enchufe (ej. Tipo C, 220V)",
  "voltage": "220V / 110V",
  "timeZone": "Zona horaria y diferencia con España",
  "tipping": "Costumbre sobre propinas (%, obligatorio, no se usa...)",
  "visa": "Requisito de visado para pasaporte español",
  "vaccinations": "Vacunas recomendadas o requeridas",
  "emergency": "Número de emergencias local",
  "customs": ["Costumbre cultural importante 1", "Costumbre cultural importante 2", "Costumbre cultural importante 3"],
  "bestTime": "Mejor época para visitar y clima esperado",
  "transport": "Principal medio de transporte local recomendado"
}

Sé conciso y útil. Máximo 1-2 frases por campo. customs: exactamente 3 ítems concretos y útiles.`;

    const raw = await askGemini(prompt, "planning", { maxOutputTokens: 1024 });
    const parsed = extractJsonObject(raw) as CountryBrief | null;
    if (!parsed) return NextResponse.json({ error: "No se pudo generar el brief." }, { status: 500 });

    return NextResponse.json({ ok: true, brief: parsed });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error generando brief." }, { status: 500 });
  }
}
