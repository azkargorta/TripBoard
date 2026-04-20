"use client";

import { useRef, useState } from "react";
import { btnPrimary } from "@/components/ui/brandStyles";

type UploadResult = {
  path: string;
  publicUrl: string | null;
  mimeType: string | null;
};

type ResourceUploadFormProps = {
  saving?: boolean;
  onUpload: (file: File) => Promise<UploadResult>;
  onCreateResource: (input: {
    title: string;
    category: string;
    notes: string;
    upload: UploadResult | null;
    detectedDocumentType?: string | null;
    detectedData?: Record<string, unknown> | null;
  }) => Promise<void>;
};

const CATEGORY_OPTIONS = [
  { value: "document", label: "Documento" },
  { value: "reservation", label: "Reserva" },
  { value: "ticket", label: "Ticket" },
  { value: "insurance", label: "Seguro" },
  { value: "other", label: "Otro" },
];

export default function ResourceUploadForm({
  saving = false,
  onUpload,
  onCreateResource,
}: ResourceUploadFormProps) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("document");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (saving) return;

    setLocalError(null);
    setSuccessMessage(null);

    try {
      const safeTitle = title.trim();
      const safeNotes = notes.trim();

      if (!safeTitle) {
        setLocalError("Introduce un título.");
        return;
      }

      if (!file) {
        setLocalError("Selecciona un archivo antes de subirlo.");
        return;
      }

      const upload = await onUpload(file);

      await onCreateResource({
        title: safeTitle,
        category,
        notes: safeNotes,
        upload,
        detectedDocumentType: category === "reservation" ? "manual_reservation_upload" : null,
        detectedData: {},
      });

      setTitle("");
      setCategory("document");
      setNotes("");
      setFile(null);
      setSuccessMessage("Documento subido correctamente.");

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      console.error("Error subiendo documento:", error);
      setLocalError(
        error instanceof Error
          ? error.message
          : "No se pudo subir el documento."
      );
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Adjuntar documento</h3>
          <p className="mt-1 text-sm text-slate-500">
            Sube imágenes o PDFs de reservas, tickets o documentos del viaje.
          </p>
        </div>

        <label className="block space-y-2">
          <span className="text-sm font-semibold text-slate-800">Título</span>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Reserva Hotel Tours"
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-slate-400"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-semibold text-slate-800">Categoría</span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-slate-400"
          >
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-semibold text-slate-800">Archivo</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf,image/*"
            onChange={(event) => {
              setFile(event.target.files?.[0] || null);
              setLocalError(null);
              setSuccessMessage(null);
            }}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900"
          />
          {file ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              Archivo seleccionado: <span className="font-semibold">{file.name}</span>
            </div>
          ) : null}
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-semibold text-slate-800">Notas</span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={5}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-slate-400"
          />
        </label>

        {localError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {localError}
          </div>
        ) : null}

        {successMessage ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {successMessage}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={saving}
          className={btnPrimary}
        >
          {saving ? "Subiendo documento..." : "Subir documento"}
        </button>
      </form>
    </div>
  );
}
