import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

function staticSuggestions(destinationRaw: string): string[] {
  const d = String(destinationRaw || "").trim().toLowerCase();
  const has = (s: string) => d.includes(s.toLowerCase());

  if (has("argentina")) {
    return [
      "Buenos Aires",
      "Cataratas del Iguazú",
      "Salta y Jujuy (Quebrada de Humahuaca)",
      "Mendoza (Aconcagua y bodegas)",
      "Bariloche y Ruta de los 7 Lagos",
      "El Calafate (Glaciar Perito Moreno)",
      "El Chaltén (senderismo Fitz Roy)",
      "Ushuaia (Tierra del Fuego)",
      "Puerto Madryn y Península Valdés",
      "Córdoba (Sierras)",
      "Mar del Plata (costa atlántica)",
      "Rosario",
      "Patagonia (Ruta 40)",
      "Carretera Austral (lado Chile, si encaja)",
    ];
  }

  if (has("españa") || has("espana") || has("spain")) {
    return [
      "Madrid",
      "Barcelona",
      "Sevilla",
      "Granada",
      "Valencia",
      "San Sebastián",
      "Bilbao",
      "Córdoba",
      "Málaga y Costa del Sol",
      "Mallorca",
      "Tenerife",
      "Santiago de Compostela",
    ];
  }

  if (has("italia") || has("italy")) {
    return ["Roma", "Florencia", "Venecia", "Milán", "Nápoles y Costa Amalfitana", "Cinque Terre", "Toscana", "Sicilia", "Lago di Como"];
  }

  if (has("japón") || has("japon") || has("japan")) {
    return ["Tokio", "Kioto", "Osaka", "Nara", "Hakone (Monte Fuji)", "Hiroshima y Miyajima", "Kanazawa", "Takayama", "Sapporo (Hokkaido)"];
  }

  // Fallback genérico (macro-destinos, sin POIs)
  return [
    "Capital / centro",
    "Ciudad histórica principal",
    "Región de naturaleza (parque nacional)",
    "Región de montaña / miradores",
    "Zona costera / playas (si aplica)",
    "Región de vino / gastronomía",
    "Ciudad secundaria con ambiente local",
    "Excursión de día (imperdible)",
  ];
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const destination = typeof body?.destination === "string" ? body.destination.trim() : "";
    if (!destination) return NextResponse.json({ error: "Falta destination." }, { status: 400 });
    const limitRaw = body?.limit;
    const limit =
      typeof limitRaw === "number" && Number.isFinite(limitRaw) ? Math.max(12, Math.min(60, Math.round(limitRaw))) : 42;

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No hay sesión activa." }, { status: 401 });

    const { data: profileRow } = await supabase.from("profiles").select("is_premium").eq("id", user.id).maybeSingle();
    if (!Boolean((profileRow as any)?.is_premium)) {
      return NextResponse.json({ error: "Necesitas cuenta Premium para usar sugerencias.", code: "PREMIUM_REQUIRED" }, { status: 402 });
    }

    // SIN IA: evita timeouts y siempre devuelve rápido.
    return NextResponse.json({ suggestions: staticSuggestions(destination).slice(0, limit) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudieron cargar sugerencias." }, { status: 500 });
  }
}

