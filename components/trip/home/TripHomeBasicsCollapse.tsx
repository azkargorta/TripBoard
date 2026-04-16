"use client";

import { useState, type ReactNode } from "react";

type Props = {
  /** Resumen en una línea (destino · fechas) cuando está colapsado en móvil */
  compactSummary: ReactNode;
  canEditTrip: boolean;
  /** Fila superior en escritorio: título + TripTripBasicsEditor */
  editor: ReactNode;
  children: ReactNode;
};

/**
 * En móvil: los datos principales van colapsados; solo se despliegan al pulsar «Editar» (o «Ver datos» si no hay permiso).
 * En md+: siempre visible, sin cambios de interacción.
 */
export default function TripHomeBasicsCollapse({ compactSummary, canEditTrip, editor, children }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <section className="card-soft p-4 md:p-8">
      {/* Móvil: franja compacta */}
      <div className="md:hidden">
        {!open ? (
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/90 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1 text-sm font-medium leading-snug text-slate-700">{compactSummary}</div>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-slate-50 active:scale-[0.99]"
            >
              {canEditTrip ? "Editar" : "Ver datos"}
            </button>
          </div>
        ) : (
          <div className="mb-4 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Datos principales</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex min-h-[40px] items-center rounded-lg px-2 text-sm font-semibold text-slate-600 underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
            >
              Ocultar
            </button>
          </div>
        )}
      </div>

      {/* Contenido completo: oculto en móvil hasta expandir; siempre visible desde md */}
      <div className={open ? "block" : "max-md:hidden md:block"}>
        <div className="mb-5 hidden items-center justify-between gap-3 md:flex">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Datos principales</div>
          {editor}
        </div>
        {open && canEditTrip ? <div className="mb-4 flex justify-end md:hidden">{editor}</div> : null}

        <div className="grid gap-6 md:grid-cols-[1.8fr_1fr]">{children}</div>
      </div>
    </section>
  );
}
