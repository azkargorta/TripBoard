import type { TripAiMode } from "@/lib/trip-ai/buildPrompt";
import { GoogleGenerativeAI } from "@google/generative-ai";

export type AiProviderId = "ollama" | "gemini";

export async function askOllama(prompt: string, mode: TripAiMode) {
  const model = process.env.OLLAMA_MODEL || "llama3";

  const response = await fetch("http://127.0.0.1:11434/api/generate", {
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

export async function askGemini(prompt: string, mode: TripAiMode) {
  const apiKey = process.env.GEMINI_API_KEY || "";
  if (!apiKey) {
    throw new Error("Falta GEMINI_API_KEY en el servidor.");
  }

  const modelName = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const temperature = mode === "optimizer" ? 0.3 : 0.5;

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: { temperature },
  });

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  if (typeof text !== "string" || !text.trim()) {
    throw new Error("Gemini no devolvió una respuesta válida.");
  }

  return text.trim();
}

function resolveProvider(requested?: string | null): AiProviderId {
  const env = (process.env.AI_PROVIDER || "").toLowerCase();
  const req = (requested || "").toLowerCase();
  const pick = (req || env) as AiProviderId;
  return pick === "gemini" ? "gemini" : "ollama";
}

function isServerlessProduction() {
  return process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
}

export async function askTripAI(prompt: string, mode: TripAiMode, options?: { provider?: string | null }) {
  const provider = resolveProvider(options?.provider ?? null);
  if (provider === "gemini") {
    try {
      return await askGemini(prompt, mode);
    } catch (e) {
      const detail = e instanceof Error ? e.message : "error desconocido";
      // En Vercel/producción no existe Ollama en localhost: el fallback rompía todo el endpoint (500).
      if (isServerlessProduction()) {
        throw new Error(`Gemini no disponible: ${detail}`);
      }
      const fallback = await askOllama(prompt, mode);
      return `${fallback}\n\n(Nota: Gemini falló y usé Ollama como fallback: ${detail})`;
    }
  }
  return await askOllama(prompt, mode);
}
