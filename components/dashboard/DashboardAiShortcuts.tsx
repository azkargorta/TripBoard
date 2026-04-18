"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Sparkles, Wand2, X } from "lucide-react";

export type DashboardAiTrip = {
  id: string;
  name: string;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function tripSubtitle(t: DashboardAiTrip) {
  const dest = (t.destination || "").trim();
  const a = t.start_date;
  const b = t.end_date;
  let dates = "";
  if (a && b) dates = `${formatDate(a)} — ${formatDate(b)}`;
  else if (a) dates = `Desde ${formatDate(a)}`;
  else if (b) dates = `Hasta ${formatDate(b)}`;
  if (dest && dates) return `${dest} · ${dates}`;
  if (dest) return dest;
  if (dates) return dates;
  return "Sin destino ni fechas";
}

type Intent = "optimize" | "auto_plans";

function openDashboardCreateTripForm() {
  try {
    window.dispatchEvent(new CustomEvent("kaviro:open-create-trip"));
    if (window.location.hash !== "#create-trip") {
      window.location.hash = "create-trip";
    }
    window.requestAnimationFrame(() => {
      document.getElementById("create-trip")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  } catch {
    /* */
  }
}

export default function DashboardAiShortcuts({
  trips,
  isPremium,
}: {
  trips: DashboardAiTrip[];
  isPremium: boolean;
}) {
  const [picker, setPicker] = useState<Intent | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!picker) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPicker(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picker]);

  useEffect(() => {
    if (!picker) return;
    const el = panelRef.current;
    if (!el) return;
    const prev = document.activeElement as HTMLElement | null;
    const focusable = el.querySelector<HTMLElement>("button, a[href]");
    focusable?.focus();
    return () => prev?.focus?.();
  }, [picker]);

  if (!isPremium) return null;

  if (trips.length === 0) {
    return (
      <p className="w-full text-center text-sm text-slate-500">
        Crea un viaje y podrás abrir el asistente con un clic desde aquí.
      </p>
    );
  }

  const hrefFor = (tripId: string, intent: Intent) =>
    `/trip/${encodeURIComponent(tripId)}/ai-chat?intent=${intent}`;

  const openPicker = (intent: Intent) => {
    if (trips.length === 1) return;
    setPicker(intent);
  };

  const closePicker = () => setPicker(null);

  const intentLabel =
    picker === "optimize"
      ? "Optimizar viaje"
      : picker === "auto_plans"
        ? "Añadir planes automáticamente"
        : "";

  return (
    <>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
        <button
          type="button"
          onClick={openDashboardCreateTripForm}
          className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-violet-300 bg-violet-50/80 px-4 py-3 text-center text-sm font-semibold text-violet-950 shadow-sm transition hover:bg-violet-50 sm:min-w-[220px] sm:flex-none"
          title="Abre el formulario para crear un viaje; al guardar con Premium puedes seguir en el asistente"
        >
          <Sparkles className="h-4 w-4 shrink-0 text-violet-700" aria-hidden />
          Crear viaje con asistente personal
        </button>
        {trips.length === 1 ? (
          <>
            <Link
              href={hrefFor(trips[0].id, "optimize")}
              className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 sm:min-w-[200px] sm:flex-none"
            >
              Optimizar viaje
            </Link>
            <Link
              href={hrefFor(trips[0].id, "auto_plans")}
              className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 sm:min-w-[220px] sm:flex-none"
            >
              <Wand2 className="h-4 w-4 shrink-0 text-slate-600" aria-hidden />
              Añadir planes automáticamente
            </Link>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => openPicker("optimize")}
              className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 sm:min-w-[200px] sm:flex-none"
            >
              Optimizar viaje…
            </button>
            <button
              type="button"
              onClick={() => openPicker("auto_plans")}
              className="inline-flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 sm:min-w-[220px] sm:flex-none"
            >
              <Wand2 className="h-4 w-4 shrink-0 text-slate-600" aria-hidden />
              Añadir planes automáticamente…
            </button>
          </>
        )}
      </div>
      {picker ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-4 sm:items-center"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closePicker();
          }}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="dash-ai-picker-title"
            className="max-h-[min(520px,85vh)] w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div className="min-w-0">
                <p id="dash-ai-picker-title" className="text-sm font-extrabold text-slate-900">
                  {intentLabel}
                </p>
                <p className="mt-1 text-xs text-slate-600">Elige el viaje en el que quieres usar el asistente.</p>
              </div>
              <button
                type="button"
                onClick={closePicker}
                className="shrink-0 rounded-full border border-slate-200 p-2 text-slate-600 transition hover:bg-slate-50"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <ul className="max-h-[min(400px,60vh)] overflow-y-auto p-2">
              {trips.map((t) => (
                <li key={t.id} className="p-1">
                  <Link
                    href={hrefFor(t.id, picker)}
                    onClick={closePicker}
                    className="block rounded-xl border border-transparent px-4 py-3 transition hover:border-violet-200 hover:bg-violet-50/60"
                  >
                    <span className="block font-semibold text-slate-900">{t.name}</span>
                    <span className="mt-0.5 block text-xs text-slate-600">{tripSubtitle(t)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
