import type { TripAiMode } from "@/lib/trip-ai/buildPrompt";
import { GoogleGenerativeAI } from "@google/generative-ai";

export type AiProviderId = "ollama" | "gemini";

export type TripAiUsage = {
  provider: AiProviderId;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
};

export async function askOllama(prompt: string, mode: TripAiMode) {
  const model = process.env.OLLAMA_MODEL || "llama3";
  const baseUrl = (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
  const url = `${baseUrl}/api/generate`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          temperature: mode === "optimizer" ? 0.3 : 0.5,
        },
      }),
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    throw new Error(
      `No se pudo conectar con Ollama en ${baseUrl}. ` +
        `Arranca Ollama (puerto 11434) o configura OLLAMA_URL. Detalle: ${detail}`
    );
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Ollama no respondió correctamente. ${detail}`);
  }

  const data = await response.json().catch(() => null);
  const answer = data?.response;

  if (typeof answer !== "string" || !answer.trim()) {
    throw new Error("Ollama no devolvió una respuesta válida.");
  }

  return answer.trim();
}

/** Mensaje corto para la UI cuando Google devuelve 429 / cuota. */
function formatGeminiUserError(raw: string): string {
  const lower = raw.toLowerCase();
  if (
    raw.includes("429") ||
    lower.includes("too many requests") ||
    lower.includes("quota") ||
    lower.includes("resource_exhausted") ||
    lower.includes("rate limit")
  ) {
    return (
      "Cuota de Gemini agotada (429). En el plan gratuito hay límites por minuto y por día. " +
      "Opciones: esperar unos minutos, activar facturación en Google AI Studio / Cloud, " +
      "o cambiar la variable GEMINI_MODEL por otro modelo que tu proyecto tenga habilitado. " +
      "Mientras tanto puedes desmarcar «Mejor calidad (Gemini)» y usar solo el análisis básico."
    );
  }
  if (raw.length > 400) {
    return `${raw.slice(0, 380)}…`;
  }
  return raw;
}

export async function askGemini(
  prompt: string,
  mode: TripAiMode,
  opts?: { maxOutputTokens?: number; responseMimeType?: string }
) {
  const apiKey = process.env.GEMINI_API_KEY || "";
  if (!apiKey) {
    throw new Error("Falta GEMINI_API_KEY en el servidor.");
  }

  // gemini-2.0-flash dejó de estar disponible para nuevos usuarios (404).
  const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const temperature =
    mode === "optimizer" ? 0.3 : mode === "travel_docs" ? 0.35 : mode === "planning" ? 0.35 : 0.5;

  const genAI = new GoogleGenerativeAI(apiKey);
  const planningMax =
    typeof opts?.maxOutputTokens === "number" && Number.isFinite(opts.maxOutputTokens)
      ? Math.max(256, Math.min(8192, Math.round(opts.maxOutputTokens)))
      : 6144;

  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature,
      ...(mode === "planning"
        ? { maxOutputTokens: planningMax, ...(opts?.responseMimeType ? { responseMimeType: opts.responseMimeType } : {}) }
        : {}),
    },
  });

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    if (typeof text !== "string" || !text.trim()) {
      throw new Error("Gemini no devolvió una respuesta válida.");
    }

    return text.trim();
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    throw new Error(formatGeminiUserError(raw));
  }
}

export async function askGeminiWithUsage(
  prompt: string,
  mode: TripAiMode,
  opts?: { maxOutputTokens?: number; responseMimeType?: string }
): Promise<{ text: string; usage: TripAiUsage }> {
  const modelName = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  try {
    const apiKey = process.env.GEMINI_API_KEY || "";
    if (!apiKey) {
      throw new Error("Falta GEMINI_API_KEY en el servidor.");
    }

    const temperature =
      mode === "optimizer" ? 0.3 : mode === "travel_docs" ? 0.35 : mode === "planning" ? 0.35 : 0.5;
    const genAI = new GoogleGenerativeAI(apiKey);
    const planningMax =
      typeof opts?.maxOutputTokens === "number" && Number.isFinite(opts.maxOutputTokens)
        ? Math.max(256, Math.min(8192, Math.round(opts.maxOutputTokens)))
        : 6144;

    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature,
        ...(mode === "planning"
          ? { maxOutputTokens: planningMax, ...(opts?.responseMimeType ? { responseMimeType: opts.responseMimeType } : {}) }
          : {}),
      },
    });

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    if (typeof text !== "string" || !text.trim()) {
      throw new Error("Gemini no devolvió una respuesta válida.");
    }

    const meta: any = (result as any)?.response?.usageMetadata ?? (result as any)?.usageMetadata ?? null;
    const inputTokens =
      typeof meta?.promptTokenCount === "number"
        ? meta.promptTokenCount
        : typeof meta?.inputTokenCount === "number"
          ? meta.inputTokenCount
          : null;
    const outputTokens =
      typeof meta?.candidatesTokenCount === "number"
        ? meta.candidatesTokenCount
        : typeof meta?.outputTokenCount === "number"
          ? meta.outputTokenCount
          : null;

    return {
      text: text.trim(),
      usage: {
        provider: "gemini",
        model: modelName,
        inputTokens,
        outputTokens,
      },
    };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    throw new Error(formatGeminiUserError(raw));
  }
}

function resolveProvider(requested?: string | null): AiProviderId {
  // Requisito del proyecto: usar SIEMPRE Gemini.
  // Ignoramos provider solicitado y AI_PROVIDER para evitar llamadas a Ollama (no disponible en Vercel).
  void requested;
  return "gemini";
}

function isServerlessProduction() {
  return process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
}

export async function askTripAI(
  prompt: string,
  mode: TripAiMode,
  options?: { provider?: string | null; maxOutputTokens?: number; responseMimeType?: string }
) {
  const provider = resolveProvider(options?.provider ?? null);
  if (provider === "gemini") {
    try {
      return await askGemini(prompt, mode, {
        maxOutputTokens: options?.maxOutputTokens,
        responseMimeType: options?.responseMimeType,
      });
    } catch (e) {
      const detail = e instanceof Error ? e.message : "error desconocido";
      throw new Error(detail.startsWith("Cuota de Gemini") ? detail : `Gemini no disponible: ${detail}`);
    }
  }
  return await askOllama(prompt, mode);
}

export async function askTripAIWithUsage(
  prompt: string,
  mode: TripAiMode,
  options?: { provider?: string | null; maxOutputTokens?: number; responseMimeType?: string }
): Promise<{ text: string; usage: TripAiUsage }> {
  const provider = resolveProvider(options?.provider ?? null);
  if (provider === "gemini") {
    const res = await askGeminiWithUsage(prompt, mode, {
      maxOutputTokens: options?.maxOutputTokens,
      responseMimeType: options?.responseMimeType,
    });
    return res;
  }
  const text = await askOllama(prompt, mode);
  return {
    text,
    usage: {
      provider: "ollama",
      model: process.env.OLLAMA_MODEL || "llama3",
      inputTokens: null,
      outputTokens: null,
    },
  };
}
