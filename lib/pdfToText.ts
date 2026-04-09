"use client";

type PdfJsModule = {
  getDocument: (src: unknown) => {
    promise: Promise<{
      numPages: number;
      getPage: (pageNumber: number) => Promise<{
        getTextContent: () => Promise<{ items?: Array<{ str?: unknown }> }>;
      }>;
    }>;
  };
  GlobalWorkerOptions?: {
    workerSrc: string;
  };
};

async function loadPdfJs(): Promise<PdfJsModule> {
  if (typeof window === "undefined") {
    throw new Error("PDF.js solo puede cargarse en cliente");
  }

  // Cargamos el bundle de PDF.js desde /public/pdf.mjs
  const mod = await new Function('return import("/pdf.mjs")')();
  const pdfjs = (mod?.default ?? mod) as Partial<PdfJsModule>;

  if (!pdfjs || typeof pdfjs.getDocument !== "function") {
    throw new Error("No se pudo cargar PDF.js. Verifica que exista /public/pdf.mjs");
  }

  if (pdfjs.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  }

  return pdfjs as PdfJsModule;
}

export async function extractTextFromPdfClient(file: File): Promise<string> {
  const pdfjsLib = await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();

  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const pageText = (content?.items || [])
      .map((item) => (typeof item?.str === "string" ? item.str : ""))
      .filter(Boolean)
      .join(" ");
    pages.push(pageText);
  }

  return pages.join("\n").replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

