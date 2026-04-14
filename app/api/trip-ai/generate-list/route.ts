import { NextResponse } from "next/server";
import { enforceAiMonthlyBudgetOrThrow, trackAiUsage } from "@/lib/ai-budget";
import { monthKeyUtc } from "@/lib/ai-usage";
import { isPremiumEnabledForTrip } from "@/lib/entitlements";
import { buildTripContext } from "@/lib/trip-ai/buildTripContext";
import { askTripAIWithUsage } from "@/lib/trip-ai/providers";

export const runtime = "nodejs";
export const maxDuration = 60;

type ListDraft = {
  version: 1;
  title: string;
  items: Array<{ text: string; qty: number | null; note: string | null }>;
};

function extractListDraft(answer: string): ListDraft | null {
  const start = "TRIPBOARD_LIST_JSON_START";
  const end = "TRIPBOARD_LIST_JSON_END";
  const iStart = answer.indexOf(start);
  const iEnd = answer.indexOf(end);
  if (iStart === -1 || iEnd === -1 || iEnd <= iStart) return null;
  const raw = answer.slice(iStart + start.length, iEnd).trim();
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1) return null;
    if (typeof parsed.title !== "string") return null;
    if (!Array.isArray(parsed.items)) return null;
    return parsed as ListDraft;
  } catch {
    return null;
  }
}

function buildListPrompt(context: string, prompt: string, listTitle?: string | null) {
  const titleHint = listTitle && listTitle.trim() ? `Título deseado: ${listTitle.trim()}` : "";
  return [
    "Eres un asistente experto dentro de Kaviro.",
    "Responde SIEMPRE en español.",
    "El usuario quiere crear una lista (maleta, compra, documentos a llevar, etc.).",
    "Debes devolver un borrador en JSON ENTRE ESTOS MARCADORES EXACTOS:",
    "TRIPBOARD_LIST_JSON_START",
    "{...json...}",
    "TRIPBOARD_LIST_JSON_END",
    "Formato del JSON:",
    "{",
    '  \"version\": 1,',
    '  \"title\": \"string\",',
    '  \"items\": [',
    "    {",
    '      \"text\": \"string\",',
    '      \"qty\": \"number|null\",',
    '      \"note\": \"string|null\"',
    "    }",
    "  ]",
    "}",
    "Reglas:",
    "- No incluyas comentarios ni markdown dentro del JSON.",
    "- items: 10-14 elementos, concretos y accionables (evita listas interminables).",
    "- qty usa null si no aplica; si aplica, usa números razonables (1, 2, 0.5...).",
    "- note solo si aporta valor (marca, alternativa, recordatorio).",
    "- Evita duplicados y agrupa mentalmente (ropa / higiene / tech / documentos) sin usar secciones: usa textos claros.",
    "- Si el usuario pide 'ropa', incluye básicos y una capa extra; no añadas cosas demasiado específicas sin motivo.",
    titleHint ? `- ${titleHint}` : "",
    "",
    "CONTEXTO DEL VIAJE (si ayuda):",
    context,
    "",
    "PETICIÓN DEL USUARIO:",
    prompt,
    "",
    "RESPUESTA:",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const tripId = typeof body?.tripId === "string" ? body.tripId : "";
    const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    const listTitle = typeof body?.listTitle === "string" ? body.listTitle : null;
    const provider = typeof body?.provider === "string" ? body.provider : null;

    if (!tripId) return NextResponse.json({ error: "Falta tripId" }, { status: 400 });
    if (!prompt) return NextResponse.json({ error: "Falta prompt" }, { status: 400 });

    const monthKey = monthKeyUtc();
    let supabase: any;
    let userId = "";
    try {
      const res = await enforceAiMonthlyBudgetOrThrow({ providerId: provider });
      supabase = res.supabase;
      userId = res.userId;
    } catch (e) {
      const err: any = e;
      const status =
        typeof err?.httpStatus === "number"
          ? err.httpStatus
          : err?.code === "AI_BUDGET_EXCEEDED"
            ? 402
            : 401;
      return NextResponse.json(
        {
          error: err instanceof Error ? err.message : "No autenticado.",
          code: err?.code || null,
          budget: err?.budget || null,
        },
        { status }
      );
    }

    const { data: participant, error: participantError } = await supabase
      .from("trip_participants")
      .select("id")
      .eq("trip_id", tripId)
      .eq("user_id", userId)
      .neq("status", "removed")
      .maybeSingle();
    if (participantError) throw participantError;
    if (!participant) return NextResponse.json({ error: "No tienes acceso a este viaje." }, { status: 403 });

    const isPremium = await isPremiumEnabledForTrip({ supabase, userId, tripId });
    if (!isPremium) {
      return NextResponse.json(
        { error: "Necesitas Premium (o un participante Premium en este viaje) para generar listas con IA.", code: "PREMIUM_REQUIRED" },
        { status: 402 }
      );
    }

    const context = await buildTripContext(tripId);
    const fullPrompt = buildListPrompt(context, prompt, listTitle);
    const { text: answer, usage } = await askTripAIWithUsage(fullPrompt, "planning", { provider });

    await trackAiUsage({
      supabase,
      userId,
      provider: (provider || process.env.AI_PROVIDER || "gemini").toLowerCase(),
      monthKey,
      usage,
    });

    const draft = extractListDraft(answer);
    if (!draft) {
      return NextResponse.json(
        {
          error: "La IA no devolvió el JSON esperado para la lista. Vuelve a intentarlo con una petición más concreta.",
          answer,
        },
        { status: 422 }
      );
    }

    return NextResponse.json({ draft, answer });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo generar la lista con IA." },
      { status: 500 }
    );
  }
}

