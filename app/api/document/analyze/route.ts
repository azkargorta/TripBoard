import { NextResponse } from "next/server";
import { extractTextFromPdfWithUnpdf } from "@/lib/server/pdf-engine";
import { extractTextFromImageBuffer } from "@/lib/server/document-ocr";
import { extractTextWithOcrSpace, isOcrSpaceConfigured } from "@/lib/server/ocr-space";
import { analyzeDocumentText } from "@/lib/document-analyzer";
import { askTripAI } from "@/lib/trip-ai/providers";
import { extractFirstJsonObject } from "@/lib/ai/llmJson";

export const runtime = "nodejs";
export const maxDuration = 60;

async function extractTextFromPdfBuffer(
  buffer: Buffer,
  options?: { fileName?: string | null; mimeType?: string | null }
): Promise<string> {
  // En Vercel/producción, algunas librerías de PDF pueden intentar cargar dependencias nativas (canvas)
  // y provocar cortes de conexión. Si OCR.Space está disponible, lo priorizamos para mantener estabilidad.
  const isProd = process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
  if (isProd && isOcrSpaceConfigured()) {
    const ocrText = await extractTextWithOcrSpace({
      buffer,
      fileName: options?.fileName,
      mimeType: options?.mimeType || "application/pdf",
    });
    if (ocrText.trim()) return ocrText.trim();
  }

  const parsedText = await extractTextFromPdfWithUnpdf(buffer);
  if (parsedText.trim()) return parsedText.trim();

  if (isOcrSpaceConfigured()) {
    const ocrText = await extractTextWithOcrSpace({
      buffer,
      fileName: options?.fileName,
      mimeType: options?.mimeType || "application/pdf",
    });
    if (ocrText.trim()) return ocrText.trim();
  }

  return "";
}

async function extractTextFromImage(
  buffer: Buffer,
  options?: { fileName?: string | null; mimeType?: string | null }
): Promise<string> {
  return extractTextFromImageBuffer(buffer, options);
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const provider = typeof formData.get("provider") === "string" ? String(formData.get("provider")) : null;
    const enhance = String(formData.get("enhance") || "").trim() === "1" || process.env.AI_ENHANCE_ANALYSIS === "1";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const mimeType = file.type || "";
    const fileName = file.name || "";

    let extractedText = "";

    if (mimeType.includes("pdf") || fileName.toLowerCase().endsWith(".pdf")) {
      extractedText = await extractTextFromPdfBuffer(buffer, {
        fileName,
        mimeType: mimeType || "application/pdf",
      });
    } else if (mimeType.startsWith("image/")) {
      extractedText = await extractTextFromImage(buffer, {
        fileName,
        mimeType,
      });
    }

    const detected = analyzeDocumentText(extractedText, fileName);

    let llmDetected: any = null;
    if (enhance && extractedText.trim()) {
      const prompt = [
        "Eres un extractor de datos de reservas/tickets/documentos de viaje.",
        "Devuelve SOLO un JSON (sin texto extra) con claves que puedan encajar en este esquema:",
        "{ documentType, providerName, reservationName, reservationCode, totalAmount, currency, checkInDate, checkOutDate, checkInTime, checkOutTime, address, city, country, guests, paymentStatus, confidence }",
        "Si no sabes un campo, pon null. confidence entre 0 y 1.",
        "",
        `Nombre de archivo: ${fileName}`,
        "TEXTO EXTRAÍDO:",
        extractedText.slice(0, 12000),
      ].join("\n");

      const answer = await askTripAI(prompt, "general" as any, { provider });
      llmDetected = extractFirstJsonObject(answer);
    }

    return NextResponse.json({
      ok: true,
      fileName,
      mimeType,
      extractedTextLength: extractedText.length,
      ocrSpaceEnabled: isOcrSpaceConfigured(),
      detected,
      llmDetected,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "No se pudo analizar el documento",
      },
      { status: 500 }
    );
  }
}
