/**
 * OCR híbrido para imágenes:
 * 1) tesseract.js local si está disponible
 * 2) OCR.Space si OCR_SPACE_API_KEY está configurada
 * 3) si todo falla, devuelve ""
 */
import { extractTextWithOcrSpace } from "@/lib/server/ocr-space";

async function extractTextWithTesseract(buffer: Buffer): Promise<string> {
  try {
    // En entornos serverless (p.ej. Vercel), tesseract.js suele fallar/colgar por workers/wasm.
    // Preferimos OCR.Space para mantener el endpoint estable.
    if (process.env.VERCEL === "1" || process.env.NODE_ENV === "production") return "";

    const mod: any = await import("tesseract.js");
    const tesseract = mod?.default || mod;
    if (!tesseract?.recognize) return "";

    const result = await tesseract.recognize(buffer, "eng+spa");
    return typeof result?.data?.text === "string" ? result.data.text.trim() : "";
  } catch {
    return "";
  }
}

export async function extractTextFromImageBuffer(
  buffer: Buffer,
  options?: { fileName?: string | null; mimeType?: string | null }
): Promise<string> {
  const localText = await extractTextWithTesseract(buffer);
  if (localText.trim()) return localText.trim();

  const remoteText = await extractTextWithOcrSpace({
    buffer,
    fileName: options?.fileName,
    mimeType: options?.mimeType,
  });

  return remoteText.trim();
}
