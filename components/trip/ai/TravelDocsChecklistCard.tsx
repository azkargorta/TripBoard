"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { ClipboardList, Loader2 } from "lucide-react";
import {
  levelLabel,
  type TravelDocsChecklistPayload,
} from "@/lib/trip-ai/travelDocsChecklist";
import { iconSlotFill40 } from "@/components/ui/iconTokens";

function levelBadgeClass(level: TravelDocsChecklistPayload["items"][number]["level"]) {
  switch (level) {
    case "obligatorio":
      return "border-rose-200 bg-rose-50 text-rose-900";
    case "recomendado":
      return "border-amber-200 bg-amber-50 text-amber-950";
    default:
      return "border-slate-200 bg-slate-100 text-slate-800";
  }
}

function buildItemNote(item: TravelDocsChecklistPayload["items"][number]): string | null {
  const parts: string[] = [];
  parts.push(levelLabel(item.level));
  if (item.country) parts.push(`País/región: ${item.country}`);
  if (item.notes) parts.push(item.notes);
  return parts.length ? parts.join(" · ") : null;
}

export default function TravelDocsChecklistCard({
  tripId,
  payload,
}: {
  tripId: string;
  payload: TravelDocsChecklistPayload;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof payload.items>();
    for (const it of payload.items) {
      const key = it.country || "—";
      const arr = map.get(key) || [];
      arr.push(it);
      map.set(key, arr);
    }
    return Array.from(map.entries());
  }, [payload.items]);

  const addToTripLists = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const listRes = await fetch("/api/trip-lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId,
          title: payload.title.slice(0, 200),
          visibility: "shared",
          editable_by_all: true,
        }),
      });
      const listJson = await listRes.json().catch(() => null);
      if (!listRes.ok) throw new Error(listJson?.error || "No se pudo crear la lista.");
      const listId = listJson?.list?.id as string | undefined;
      if (!listId) throw new Error("Respuesta sin lista creada.");

      for (const it of payload.items) {
        const note = buildItemNote(it);
        const res = await fetch(`/api/trip-lists/${encodeURIComponent(listId)}/items`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tripId,
            text: it.requirement.slice(0, 2000),
            qty: null,
            note: note && note.length <= 5000 ? note : note?.slice(0, 4990) + "…",
          }),
        });
        if (!res.ok) {
          const t = await res.text();
          throw new Error(t || "No se pudo añadir un elemento a la lista.");
        }
      }
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar la lista.");
    } finally {
      setBusy(false);
    }
  }, [payload.items, payload.title, tripId]);

  return (
    <div className="w-full max-w-[88%] rounded-2xl border border-cyan-200/80 bg-gradient-to-br from-cyan-50/90 via-white to-sky-50/50 p-4 shadow-sm ring-1 ring-cyan-100">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-600 text-white shadow-sm ${iconSlotFill40}`}
        >
          <ClipboardList aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-cyan-900">Checklist documentos</p>
          <h3 className="mt-0.5 text-sm font-bold text-slate-950">{payload.title}</h3>
          {payload.intro ? <p className="mt-1 text-xs leading-relaxed text-slate-600">{payload.intro}</p> : null}
        </div>
      </div>

      <div className="mt-4 max-h-[min(52vh,320px)] space-y-4 overflow-y-auto pr-1">
        {grouped.map(([country, rows]) => (
          <div key={country}>
            {country !== "—" ? (
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">{country}</p>
            ) : null}
            <ul className="space-y-2">
              {rows.map((it, idx) => (
                <li
                  key={`${it.requirement}-${idx}`}
                  className="flex gap-2 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-2.5 text-sm shadow-sm"
                >
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${levelBadgeClass(it.level)}`}
                  >
                    {levelLabel(it.level)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-snug text-slate-900">{it.requirement}</p>
                    {it.notes ? <p className="mt-1 text-xs leading-relaxed text-slate-600">{it.notes}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {error ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">{error}</div>
      ) : null}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <p className="text-[11px] text-slate-500">
          Se creará una <strong className="text-slate-700">lista compartida</strong> en este viaje con un ítem por requisito.
        </p>
        <div className="flex flex-wrap gap-2">
          {done ? (
            <Link
              href={`/trip/${encodeURIComponent(tripId)}/resources`}
              className="inline-flex min-h-10 items-center justify-center rounded-xl bg-slate-950 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
            >
              Ver en Recursos → Listas
            </Link>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => void addToTripLists()}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-cyan-700 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-cyan-800 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {busy ? "Guardando…" : "Añadir a listas del viaje"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
