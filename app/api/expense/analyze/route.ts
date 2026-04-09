import { NextResponse } from "next/server";
import { analyzeTravelDocument } from "@/lib/document-analyzer";
import { buildExpenseAnalyzerResult } from "@/lib/expense-analyzer";
import { askTripAI } from "@/lib/trip-ai/providers";
import { extractFirstJsonObject } from "@/lib/ai/llmJson";

export const runtime = "nodejs";
export const maxDuration = 60;

async function extractTextFromPdfBuffer(buffer: Buffer): Promise<string> {
  try {
    const engineModule: any = await import("@/lib/server/pdf-engine");
    const fn = engineModule?.extractTextFromPdfWithUnpdf;
    if (typeof fn !== "function") return "";
    const text = await fn(buffer);
    return typeof text === "string" ? text.trim() : "";
  } catch {
    return "";
  }
}

async function extractTextFromImageBuffer(buffer: Buffer): Promise<string> {
  try {
    const ocrModule: any = await import("@/lib/server/document-ocr");
    const fn = ocrModule?.extractTextFromImageBuffer;
    if (typeof fn !== "function") return "";
    return await fn(buffer);
  } catch {
    return "";
  }
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const provider = typeof formData.get("provider") === "string" ? String(formData.get("provider")) : null;
    const enhance = String(formData.get("enhance") || "").trim() === "1" || process.env.AI_ENHANCE_ANALYSIS === "1";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Falta el archivo." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    let text = "";
    let extractionMethod: "pdf-parse" | "image-ocr" | "empty" = "empty";
    let warnings: string[] = [];

    if (
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf")
    ) {
      text = await extractTextFromPdfBuffer(buffer);
      extractionMethod = text ? "pdf-parse" : "empty";

      if (!text) {
        warnings.push("No se pudo extraer texto del PDF.");
      }
    } else if (file.type.startsWith("image/")) {
      text = await extractTextFromImageBuffer(buffer);
      extractionMethod = "image-ocr";

      if (!text) {
        warnings.push("No se pudo extraer texto de la imagen.");
      }
    }

    // 🔥 AQUÍ ESTÁ LA CLAVE
    const expense = buildExpenseAnalyzerResult({
      text,
      fileName: file.name,
      mimeType: file.type,
      extractionMethod: extractionMethod === "pdf-parse" ? "pdf-parse" : extractionMethod === "image-ocr" ? "image-ocr" : "empty",
    });

    let llmExpense: any = null;
    let llmError: string | null = null;
    if (enhance && text.trim()) {
      const prompt = [
        "Eres un extractor de datos de gastos a partir de tickets/facturas.",
        "Devuelve SOLO un JSON con este esquema:",
        "{ title, category, amount, currency, expenseDate, merchantName, confidence }",
        "category debe ser una de: lodging, transport, food, tickets, shopping, general.",
        "expenseDate en formato YYYY-MM-DD si es posible. confidence entre 0 y 1.",
        "Si no sabes un campo, pon null.",
        "",
        `Nombre de archivo: ${file.name}`,
        "TEXTO EXTRAÍDO:",
        text.slice(0, 12000),
      ].join("\n");
      try {
        const answer = await askTripAI(prompt, "general" as any, { provider });
        llmExpense = extractFirstJsonObject(answer);
      } catch (e) {
        llmError = e instanceof Error ? e.message : "Error al llamar a la IA.";
      }
    }

    return NextResponse.json({
      ...expense,
      extractedText: text,
      sharedWarnings: warnings,
      llmExpense,
      llmError,
      extractedTextLength: text.length,
    });

  } catch (error) {
    return NextResponse.json(
      { error: "Error analizando documento" },
      { status: 500 }
    );
  }
}