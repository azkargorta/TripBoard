"use client";

type PdfJsModule = {
  getDocument: (src: unknown) => {
    promise: Promise<{
      numPages: number;
      getPage: (pageNumber: number) => Promise<{
        getViewport: (args: { scale: number }) => { width: number; height: number };
        render: (args: {
          canvasContext: CanvasRenderingContext2D;
          viewport: { width: number; height: number };
        }) => { promise: Promise<void> };
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

  const mod = await import(
    /* webpackIgnore: true */
    "/pdf.mjs"
  );

  const pdfjs = (mod?.default ?? mod) as Partial<PdfJsModule>;

  if (!pdfjs || typeof pdfjs.getDocument !== "function") {
    throw new Error(
      "No se pudo cargar PDF.js. Verifica que exista /public/pdf.mjs"
    );
  }

  if (pdfjs.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  }

  return pdfjs as PdfJsModule;
}

export async function convertPdfToImages(file: File): Promise<Blob[]> {
  if (typeof window === "undefined") {
    throw new Error("La conversión de PDF solo puede ejecutarse en cliente");
  }

  const pdfjsLib = await loadPdfJs();
  const arrayBuffer = await file.arrayBuffer();

  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const images: Blob[] = [];

  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 });

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("No se pudo crear el canvas para renderizar el PDF");
    }

    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    await page.render({
      canvasContext: context,
      viewport,
    }).promise;

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/png");
    });

    if (!blob) {
      throw new Error("No se pudo convertir una página del PDF a imagen");
    }

    images.push(blob);
  }

  return images;
}