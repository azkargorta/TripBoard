"use client";

import { useEffect, useMemo, useState } from "react";

type AuditRow = {
  id: string;
  trip_id: string;
  entity_type: string;
  entity_id: string;
  action: "create" | "update" | "delete";
  summary: string | null;
  diff: any;
  actor_user_id: string | null;
  actor_email: string | null;
  created_at: string;
};

function formatWhen(value: string) {
  try {
    const date = new Date(value);
    return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(date);
  } catch {
    return value;
  }
}

function displayActor(row: AuditRow) {
  if (row.actor_email && row.actor_email.trim()) return row.actor_email.trim();
  if (row.actor_user_id && row.actor_user_id.trim()) return row.actor_user_id.trim();
  return "Sistema";
}

export default function AuditLogDialog({
  open,
  onClose,
  tripId,
  entityType,
  entityId,
  title,
}: {
  open: boolean;
  onClose: () => void;
  tripId: string;
  entityType: string;
  entityId: string;
  title: string;
}) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/trip-audit?tripId=${encodeURIComponent(tripId)}&entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}&limit=60`,
          { method: "GET" }
        );
        const text = await res.text();
        const payload = (() => {
          try {
            return text ? JSON.parse(text) : null;
          } catch {
            return { error: text || "Respuesta no JSON." };
          }
        })();
        if (!res.ok) throw new Error(payload?.error || `Error ${res.status}`);
        if (!cancelled) setRows(Array.isArray(payload?.logs) ? payload.logs : []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "No se pudo cargar el historial.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, tripId, entityType, entityId]);

  const body = useMemo(() => {
    if (loading) return <div className="px-5 py-4 text-sm text-slate-600">Cargando historial…</div>;
    if (error) return <div className="px-5 py-4 text-sm text-red-700">{error}</div>;
    if (!rows.length) return <div className="px-5 py-4 text-sm text-slate-600">No hay cambios registrados.</div>;
    return (
      <div className="max-h-[62vh] overflow-auto px-5 py-4">
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-950">
                    {r.summary || `${r.action} ${r.entity_type}`}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {formatWhen(r.created_at)}
                  </div>
                </div>
                <span
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                    r.action === "create"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : r.action === "delete"
                        ? "border-rose-200 bg-rose-50 text-rose-800"
                        : "border-slate-200 bg-slate-50 text-slate-700"
                  }`}
                >
                  {r.action === "create" ? "Creó" : r.action === "delete" ? "Borró" : "Editó"}
                </span>
              </div>
              <div className="mt-2 text-xs text-slate-500">
                Hecho por <span className="font-semibold text-slate-700">{displayActor(r)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }, [loading, error, rows]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/30 p-4 backdrop-blur sm:items-center">
      <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Historial</div>
            <div className="mt-1 truncate text-lg font-bold text-slate-950">{title}</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cerrar
          </button>
        </div>
        {body}
      </div>
    </div>
  );
}

