const OCR_SPACE_ENDPOINT = "https://api.ocr.space/parse/image";

type OcrSpaceParsedResult = {
  ParsedText?: string;
};

type OcrSpaceResponse = {
  IsErroredOnProcessing?: boolean;
  ErrorMessage?: string[] | string;
  ParsedResults?: OcrSpaceParsedResult[];
};

function hasApiKey() {
  return Boolean(process.env.OCR_SPACE_API_KEY);
}

export function isOcrSpaceConfigured() {
  return hasApiKey();
}

export async function extractTextWithOcrSpace(input: {
  buffer: Buffer;
  fileName?: string | null;
  mimeType?: string | null;
}): Promise<string> {
  if (!hasApiKey()) return "";

  const formData = new FormData();
  const blob = new Blob([input.buffer], {
    type: input.mimeType || "application/octet-stream",
  });

  formData.append("file", blob, input.fileName || "document");
  formData.append("language", "spa");
  formData.append("isOverlayRequired", "false");
  formData.append("OCREngine", "2");
  formData.append("isCreateSearchablePdf", "false");
  formData.append("scale", "true");
  formData.append("detectOrientation", "true");

  const response = await fetch(OCR_SPACE_ENDPOINT, {
    method: "POST",
    headers: {
      apikey: process.env.OCR_SPACE_API_KEY || "",
    },
    body: formData,
    cache: "no-store",
  });

  if (!response.ok) {
    return "";
  }

  const data = (await response.json().catch(() => null)) as OcrSpaceResponse | null;
  if (!data || data.IsErroredOnProcessing) {
    return "";
  }

  const text = (data.ParsedResults || [])
    .map((result) => result?.ParsedText || "")
    .join("\n")
    .trim();

  return text;
}
