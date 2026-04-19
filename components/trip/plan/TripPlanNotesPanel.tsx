"use client";

import { useCallback, useState } from "react";
import { NotebookPen } from "lucide-react";
import { iconSlotFill40 } from "@/components/ui/iconTokens";

const MAX_LEN = 10_000;

export default function TripPlanNotesPanel({
  tripId,
  initialDescription,
  readOnly,
}: {
  tripId: string;
  initialDescription: string | null;
  readOnly: boolean;
}) {
  const [text, setText] = useState(() => (initialDescription ?? "").slice(0, MAX_LEN));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(async () => {
    if (readOnly) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const trimmed = text.trim();
      const res = await fetch(`/api/trips/${encodeURIComponent(tripId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: trimmed.length ? trimmed.slice(0, MAX_LEN) : null }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error || "No se pudo guardar.");
      setMessage("Guardado");
      window.setTimeout(() => setMessage(null), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar.");
    } finally {
      setSaving(false);
    }
  }, [readOnly, text, tripId]);

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-violet-100 bg-violet-50 text-violet-800 ${iconSlotFill40}`}
        >
          <NotebookPen aria-hidden />
        </div>
        <div className="min-w-0 space-y-1">
          <h2 className="text-lg font-extrabold tracking-tight text-slate-950">Notas del viaje</h2>
          <p className="text-sm text-slate-600">
            Ideas sueltas, enlaces y recordatorios para el grupo o contexto que no encaje en un plan concreto.
          </p>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      ) : null}

      <label className="block space-y-2">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Texto</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, MAX_LEN))}
          readOnly={readOnly}
          disabled={readOnly}
          rows={14}
          maxLength={MAX_LEN}
          placeholder="Ej. preferimos desayunos tarde, evitar museos los lunes, enlace al billete del tren…"
          className="min-h-[220px] w-full resize-y rounded-2xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100 disabled:cursor-not-allowed disabled:opacity-70"
        />
        <span className="text-xs text-slate-500">
          {text.length}/{MAX_LEN} caracteres
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        {readOnly ? (
          <p className="text-sm text-slate-600">Solo lectura: no tienes permiso para editar notas del viaje.</p>
        ) : (
          <>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
            >
              {saving ? "Guardando…" : "Guardar notas"}
            </button>
            {message ? <span className="text-sm font-semibold text-emerald-700">{message}</span> : null}
          </>
        )}
      </div>
    </section>
  );
}
