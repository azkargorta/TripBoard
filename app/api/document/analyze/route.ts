import { NextResponse } from "next/server";
import { extractTextFromPdfWithUnpdf } from "@/lib/server/pdf-engine";
import { extractTextFromImageBuffer } from "@/lib/server/document-ocr";
import { extractTextWithOcrSpace, isOcrSpaceConfigured } from "@/lib/server/ocr-space";
import { analyzeDocumentText } from "@/lib/document-analyzer";

async function extractTextFromPdfBuffer(
  buffer: Buffer,
  options?: { fileName?: string | null; mimeType?: string | null }
): Promise<string> {
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

    return NextResponse.json({
      ok: true,
      fileName,
      mimeType,
      extractedTextLength: extractedText.length,
      ocrSpaceEnabled: isOcrSpaceConfigured(),
      detected,
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
