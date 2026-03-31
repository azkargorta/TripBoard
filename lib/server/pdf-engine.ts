/**
 * Extracción híbrida para PDF:
 * 1) pdf-parse
 * 2) pdfjs-dist
 * 3) si el PDF sigue sin texto, route.ts puede usar OCR.Space como fallback
 */
async function tryPdfParse(buffer: Buffer): Promise<string> {
  try {
    const mod: any = await import("pdf-parse");
    const pdfParse = mod?.default || mod;
    if (typeof pdfParse !== "function") return "";
    const result = await pdfParse(buffer);
    return typeof result?.text === "string" ? result.text.trim() : "";
  } catch {
    return "";
  }
}

async function tryPdfJs(buffer: Buffer): Promise<string> {
  try {
    const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
    const pdf = await loadingTask.promise;

    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = (content?.items || [])
        .map((item: any) => (typeof item?.str === "string" ? item.str : ""))
        .join(" ");
      pages.push(pageText);
    }

    return pages.join("\n").trim();
  } catch {
    return "";
  }
}

export async function extractTextFromPdfWithUnpdf(buffer: Buffer): Promise<string> {
  const first = await tryPdfParse(buffer);
  if (first.trim()) return first.trim();

  const second = await tryPdfJs(buffer);
  if (second.trim()) return second.trim();

  return "";
}
