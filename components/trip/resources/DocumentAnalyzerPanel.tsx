"use client";

import { useState } from "react";
import type { DetectedDocumentData } from "@/lib/document-analyzer";

type Props = {
  onUseDetectedData: (data: DetectedDocumentData) => void;
};

function prettyLabel(value?: string | null) {
  if (!value) return "Sin detectar";
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function DocumentAnalyzerPanel({ onUseDetectedData }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detected, setDetected] = useState<DetectedDocumentData | null>(null);
  const [useGemini, setUseGemini] = useState(false);

  async function handleAnalyze() {
    if (!file) {
      setError("Selecciona un archivo antes de analizar.");
      return;
    }

    setLoading(true);
    setError(null);
    setDetected(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("enhance", "1");
      if (useGemini) formData.append("provider", "gemini");

      const response = await fetch("/api/document/analyze", {
        method: "POST",
        body: formData,
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || "No se pudo analizar el documento.");
      }

      if (!data?.detected) {
        throw new Error("No se ha recibido ningún resultado del analizador.");
      }

      // Si hay mejora LLM, mezclar (LLM tiene prioridad) manteniendo extractedText/confidence si vienen.
      const llm = data?.llmDetected;
      setDetected(llm && typeof llm === "object" ? { ...data.detected, ...llm } : data.detected);
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo analizar el documento.";
      if (/fetch failed|failed to fetch|networkerror/i.test(message)) {
        setError(
          `No se pudo conectar con el servidor (${typeof window !== "undefined" ? window.location.origin : "localhost"}). ` +
            "Normalmente es porque estás en otro puerto (3001/3002) o el servidor se reinició. " +
            "Abre la app en http://localhost:3000 y recarga (Ctrl+F5)."
        );
        return;
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h4 className="text-xl font-semibold text-slate-900">Analizador de documento</h4>
      <p className="mt-2 text-sm text-slate-500">
        Adjunta un PDF o imagen. Analizaremos el texto y te mostraremos el resultado antes de aplicarlo al formulario.
      </p>

      <div className="mt-5 space-y-4">
        <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
          <input type="checkbox" checked={useGemini} onChange={(e) => setUseGemini(e.target.checked)} />
          Mejor calidad (Gemini)
        </label>

        <div>
          <label className="block text-sm font-semibold text-slate-900">Archivo del documento</label>
          <div className="mt-2 rounded-2xl border border-slate-300 bg-white px-4 py-3">
            <input
              type="file"
              accept=".pdf,image/*"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
              className="block w-full text-sm text-slate-900"
            />
          </div>
        </div>

        {file ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            Archivo seleccionado: <span className="font-semibold text-slate-950">{file.name}</span>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={loading || !file}
            className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Analizando..." : "Analizar documento"}
          </button>

          {detected ? (
            <button
              type="button"
              onClick={() => onUseDetectedData(detected)}
              className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-700"
            >
              Usar este resultado
            </button>
          ) : null}
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {detected ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <h5 className="text-base font-semibold text-slate-900">Resultado del análisis</h5>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                Confianza: {Math.round((detected.confidence || 0) * 100)}%
              </span>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-xl bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Tipo detectado</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {prettyLabel(detected.documentType)}
                </p>
              </div>

              <div className="rounded-xl bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Proveedor / nombre</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {detected.providerName || detected.reservationName || "Sin detectar"}
                </p>
              </div>

              <div className="rounded-xl bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Código</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {detected.reservationCode || "Sin detectar"}
                </p>
              </div>

              <div className="rounded-xl bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Importe</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {detected.totalAmount != null ? `${detected.totalAmount} ${detected.currency || ""}`.trim() : "Sin detectar"}
                </p>
              </div>

              <div className="rounded-xl bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Fechas</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {detected.checkInDate || detected.departureDate || detected.activityDate || "Sin detectar"}
                  {(detected.checkOutDate || detected.arrivalDate) ? ` → ${detected.checkOutDate || detected.arrivalDate}` : ""}
                </p>
              </div>

              <div className="rounded-xl bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Ubicación</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {detected.address || detected.location || detected.destination || "Sin detectar"}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Texto extraído</p>
              <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap text-xs text-slate-700">
                {detected.extractedText?.trim() || "No se ha podido extraer texto del archivo."}
              </pre>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
