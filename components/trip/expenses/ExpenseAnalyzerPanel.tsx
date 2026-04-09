"use client";

import { useState } from "react";
import { extractTextFromPdfClient } from "@/lib/pdfToText";

export type ExpenseDetectedData = {
  title?: string | null;
  category?: string | null;
  amount?: number | null;
  currency?: string | null;
  expenseDate?: string | null;
  merchantName?: string | null;
  extractedText?: string | null;
  extractionMethod?: string | null;
  warnings?: string[];
  sharedWarnings?: string[];
  file?: File | null;
};

export default function ExpenseAnalyzerPanel({
  onUseDetectedData,
}: {
  onUseDetectedData: (data: ExpenseDetectedData) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExpenseDetectedData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [useGemini, setUseGemini] = useState(false);

  async function analyze() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

      // Preferimos extraer el texto del PDF en cliente (PDF.js) porque es más fiable en Next.
      if (isPdf) {
        const pdfText = await extractTextFromPdfClient(file).catch(() => "");
        if (pdfText.trim().length >= 50) {
          const response = await fetch("/api/expense/analyze-text", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: pdfText,
              fileName: file.name,
              mimeType: file.type,
              enhance: true,
              provider: useGemini ? "gemini" : null,
            }),
          });

          const payload = await response.json().catch(() => null);
          if (!response.ok) throw new Error(payload?.error || "No se pudo analizar el archivo.");

          const llm = payload?.llmExpense && typeof payload.llmExpense === "object" ? payload.llmExpense : null;
          setResult({
            title: llm?.title ?? payload?.title ?? payload?.suggestedTitle ?? null,
            category: llm?.category ?? payload?.category ?? "general",
            amount:
              typeof llm?.amount === "number"
                ? llm.amount
                : typeof payload?.amount === "number"
                  ? payload.amount
                  : null,
            currency: llm?.currency ?? payload?.currency ?? "EUR",
            expenseDate: llm?.expenseDate ?? payload?.expenseDate ?? null,
            merchantName: llm?.merchantName ?? payload?.merchantName ?? null,
            extractedText: payload?.extractedText || pdfText || null,
            extractionMethod: payload?.extractionMethod || "pdfjs-client",
            warnings: Array.isArray(payload?.warnings) ? payload.warnings : [],
            sharedWarnings: Array.isArray(payload?.sharedWarnings) ? payload.sharedWarnings : [],
            file,
          });
          return;
        }
      }

      // Fallback: sube el archivo al servidor
      const formData = new FormData();
      formData.append("file", file);
      formData.append("enhance", "1");
      if (useGemini) formData.append("provider", "gemini");

      const response = await fetch("/api/expense/analyze", { method: "POST", body: formData });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(payload?.error || "No se pudo analizar el archivo.");
      }

      const llm = payload?.llmExpense && typeof payload.llmExpense === "object" ? payload.llmExpense : null;
      setResult({
        title: llm?.title ?? payload?.title ?? payload?.suggestedTitle ?? null,
        category: llm?.category ?? payload?.category ?? "general",
        amount: typeof llm?.amount === "number" ? llm.amount : typeof payload?.amount === "number" ? payload.amount : null,
        currency: llm?.currency ?? payload?.currency ?? "EUR",
        expenseDate: llm?.expenseDate ?? payload?.expenseDate ?? null,
        merchantName: llm?.merchantName ?? payload?.merchantName ?? null,
        extractedText: payload?.extractedText || null,
        extractionMethod: payload?.extractionMethod || null,
        warnings: Array.isArray(payload?.warnings) ? payload.warnings : [],
        sharedWarnings: Array.isArray(payload?.sharedWarnings) ? payload.sharedWarnings : [],
        file,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo analizar.");
    } finally {
      setLoading(false);
    }
  }

  const combinedWarnings = [
    ...(result?.warnings || []),
    ...(result?.sharedWarnings || []),
  ];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="inline-flex items-center gap-2 rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
        <span>🧾</span>
        <span>Analizador de factura o ticket</span>
      </div>

      <h3 className="mt-3 text-lg font-semibold text-slate-900">Analizar PDF o imagen</h3>
      <p className="mt-1 text-sm text-slate-500">
        Usa el mismo análisis documental que Recursos y aplica reglas específicas para reservas, facturas y tickets.
      </p>

      <div className="mt-4 space-y-4">
        <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
          <input type="checkbox" checked={useGemini} onChange={(e) => setUseGemini(e.target.checked)} />
          Mejor calidad (Gemini)
        </label>
        <label className="block space-y-2">
          <span className="text-sm font-semibold text-slate-800">Archivo</span>
          <input
            type="file"
            accept="image/*,.pdf"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full rounded-xl border border-slate-300 px-4 py-3"
          />
        </label>

        {file ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            Archivo seleccionado: <strong>{file.name}</strong>
          </div>
        ) : null}

        <button
          type="button"
          onClick={analyze}
          disabled={!file || loading}
          className={`rounded-xl px-4 py-3 text-sm font-semibold ${!file || loading ? "bg-slate-200 text-slate-500" : "bg-slate-950 text-white"}`}
        >
          {loading ? "Analizando..." : "Analizar archivo"}
        </button>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {result ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="space-y-2 text-sm text-emerald-900">
              <p><strong>Título sugerido:</strong> {result.title || "Sin detectar"}</p>
              <p><strong>Comercio:</strong> {result.merchantName || "Sin detectar"}</p>
              <p><strong>Categoría:</strong> {result.category || "general"}</p>
              <p><strong>Importe:</strong> {result.amount != null ? result.amount.toFixed(2) : "Sin detectar"}</p>
              <p><strong>Moneda:</strong> {result.currency || "EUR"}</p>
              <p><strong>Fecha:</strong> {result.expenseDate || "Sin detectar"}</p>
              <p><strong>Método:</strong> {result.extractionMethod || "Sin indicar"}</p>
            </div>

            {combinedWarnings.length ? (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {combinedWarnings.map((warning, index) => (
                  <p key={`${warning}-${index}`}>{warning}</p>
                ))}
              </div>
            ) : null}

            {result.extractedText ? (
              <details className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                  Ver texto extraído
                </summary>
                <pre className="mt-3 whitespace-pre-wrap break-words text-xs text-slate-600">
                  {result.extractedText}
                </pre>
              </details>
            ) : null}

            <button
              type="button"
              onClick={() => onUseDetectedData(result)}
              className="mt-4 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white"
            >
              Usar datos detectados
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
