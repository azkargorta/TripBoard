import { NextResponse } from "next/server";
import { analyzeTravelDocument } from "@/lib/document-analyzer";
import { buildExpenseAnalyzerResult } from "@/lib/expense-analyzer";
import { askTripAI } from "@/lib/trip-ai/providers";
import { extractFirstJsonObject } from "@/lib/ai/llmJson";

export const runtime = "nodejs";
export const maxDuration = 60;

// 👇 COPIADO de Recursos (MISMO MOTOR)
async function extractTextFromPdfParse(buffer: Buffer): Promise<string> {
  try {
    const pdfParseModule: any = await import("pdf-parse");
    const pdfParse = pdfParseModule?.default ?? pdfParseModule;
    const parsed = await pdfParse(buffer);
    return String(parsed?.text || "").replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

async function extractTextFromPdfWithUnpdfSafe(buffer: Buffer): Promise<string> {
  try {
    const engineModule: any = await import("@/lib/server/pdf-engine");
    const fn = engineModule?.extractTextFromPdfWithUnpdf;
    if (typeof fn !== "function") return "";
    return await fn(buffer);
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
    let extractionMethod = "unknown";
    let warnings: string[] = [];

    // 👇 MISMA LÓGICA QUE RECURSOS
    if (
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf")
    ) {
      text = await extractTextFromPdfParse(buffer);
      extractionMethod = text ? "pdf-parse" : "pdf-parse-empty";

      if (!text || text.length < 100) {
        const unpdfText = await extractTextFromPdfWithUnpdfSafe(buffer);
        if (unpdfText && unpdfText.length > text.length) {
          text = unpdfText;
          extractionMethod = "unpdf-text";
        }
      }

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
      extractionMethod: extractionMethod as any,
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
    });

  } catch (error) {
    return NextResponse.json(
      { error: "Error analizando documento" },
      { status: 500 }
    );
  }
}