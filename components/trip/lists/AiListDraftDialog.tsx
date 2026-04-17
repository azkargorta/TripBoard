"use client";

import { useMemo, useState } from "react";

type DraftItem = { text: string; qty: number | null; note: string | null };
type Draft = { version: 1; title: string; items: DraftItem[] };

export default function AiListDraftDialog({
  open,
  onClose,
  tripId,
  onConfirmCreate,
}: {
  open: boolean;
  onClose: () => void;
  tripId: string;
  onConfirmCreate: (draft: Draft) => Promise<void>;
}) {
  const [prompt, setPrompt] = useState("");
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const canConfirm = Boolean(draft?.items?.length && (draft?.title || "").trim());

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/trip-ai/generate-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, prompt, listTitle: title || null }),
      });
      const text = await res.text();
      const payload = (() => {
        try {
          return text ? JSON.parse(text) : null;
        } catch {
          return { error: text || "Respuesta no JSON." };
        }
      })();
      if (!res.ok) throw new Error(payload?.error || `Error ${res.status}`);
      if (!payload?.draft) throw new Error("No se recibió borrador.");
      setDraft(payload.draft as Draft);
    } catch (e) {
      setDraft(null);
      setError(e instanceof Error ? e.message : "No se pudo generar la lista.");
    } finally {
      setLoading(false);
    }
  }

  const content = useMemo(() => {
    if (!draft) return null;
    return (
      <div className="space-y-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Título</div>
          <input
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          />
        </div>
        <div>
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Items</div>
            <button
              type="button"
              onClick={() => setDraft({ ...draft, items: [...draft.items, { text: "", qty: null, note: null }] })}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Añadir item
            </button>
          </div>
          <div className="mt-2 max-h-[45vh] space-y-2 overflow-auto pr-1">
            {draft.items.map((it, idx) => (
              <div key={idx} className="grid gap-2 rounded-2xl border border-slate-200 bg-white p-3 sm:grid-cols-[minmax(0,1fr)_110px]">
                <input
                  value={it.text}
                  onChange={(e) => {
                    const next = [...draft.items];
                    next[idx] = { ...it, text: e.target.value };
                    setDraft({ ...draft, items: next });
                  }}
                  placeholder="Elemento…"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                />
                <input
                  value={it.qty ?? ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    const qty = val === "" ? null : Number(val);
                    const next = [...draft.items];
                    next[idx] = { ...it, qty: Number.isFinite(qty as any) ? (qty as any) : null };
                    setDraft({ ...draft, items: next });
                  }}
                  placeholder="Cant."
                  type="number"
                  step="0.5"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                />
                <input
                  value={it.note ?? ""}
                  onChange={(e) => {
                    const next = [...draft.items];
                    next[idx] = { ...it, note: e.target.value || null };
                    setDraft({ ...draft, items: next });
                  }}
                  placeholder="Nota (opcional)…"
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm sm:col-span-2"
                />
                <div className="sm:col-span-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      const next = [...draft.items];
                      next.splice(idx, 1);
                      setDraft({ ...draft, items: next });
                    }}
                    className="rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
                  >
                    Quitar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }, [draft]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/30 p-4 backdrop-blur sm:items-center">
      <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Asistente personal</div>
            <div className="mt-1 truncate text-lg font-bold text-slate-950">Generar lista</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cerrar
          </button>
        </div>

        <div className="min-h-0 overflow-auto px-5 py-4">
          {error ? (
            <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          ) : null}

          <div className="grid gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Qué quieres</div>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                placeholder="Ej: Hazme una lista de la compra para 4 días en una casa con barbacoa…"
                className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Título sugerido (opcional)</div>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ej: Lista de la compra"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              />
            </div>

            <button
              type="button"
              onClick={generate}
              disabled={loading || !prompt.trim()}
              className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {loading ? "Generando…" : "Generar borrador"}
            </button>

            {draft ? (
              <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                {content}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!canConfirm || loading}
            onClick={async () => {
              if (!draft) return;
              setLoading(true);
              setError(null);
              try {
                // limpiado básico
                const cleaned: Draft = {
                  version: 1,
                  title: (draft.title || "").trim() || "Lista",
                  items: (draft.items || [])
                    .map((it) => ({
                      text: (it.text || "").trim(),
                      qty: it.qty ?? null,
                      note: it.note ?? null,
                    }))
                    .filter((it) => it.text),
                };
                if (!cleaned.items.length) throw new Error("La lista no tiene items válidos.");
                await onConfirmCreate(cleaned);
                setPrompt("");
                setTitle("");
                setDraft(null);
                onClose();
              } catch (e) {
                setError(e instanceof Error ? e.message : "No se pudo crear la lista.");
              } finally {
                setLoading(false);
              }
            }}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            Crear lista
          </button>
        </div>
      </div>
    </div>
  );
}

