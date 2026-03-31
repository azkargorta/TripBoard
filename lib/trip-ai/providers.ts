import type { TripAiMode } from "@/lib/trip-ai/buildPrompt";

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
