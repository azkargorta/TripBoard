"use client";

import { useEffect, useMemo, useState } from "react";

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-white">
      {children}
    </span>
  );
}

export default function OnboardingNudge({
  hasTrips,
}: {
  hasTrips: boolean;
}) {
  const storageKey = useMemo(() => "kaviro_onboarding_v1", []);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const seen = window.localStorage.getItem(storageKey) === "1";
      if (!seen && !hasTrips) setOpen(true);
    } catch {
      // Si localStorage falla (modo privado), no bloqueamos al usuario.
    }
  }, [hasTrips, storageKey]);

  function close() {
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      /* */
    }
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm"
      onMouseDown={close}
    >
      <div
        className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Bienvenido/a
            </p>
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-950">
              Empieza tu primer viaje en 60 segundos
            </h2>
            <p className="text-sm text-slate-600">
              Lo esencial es muy simple: crea el viaje y luego añade lo que necesites.
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cerrar
          </button>
        </div>

        <div className="mt-5 grid gap-3">
          <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <Icon>1</Icon>
            <div>
              <p className="font-semibold text-slate-950">Crea el viaje</p>
              <p className="mt-1 text-sm text-slate-600">
                Ponle un nombre y (opcional) destino/fechas.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <Icon>2</Icon>
            <div>
              <p className="font-semibold text-slate-950">Invita a tu grupo</p>
              <p className="mt-1 text-sm text-slate-600">
                Comparte un enlace y que cada persona añada sus gastos/plan.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <Icon>3</Icon>
            <div>
              <p className="font-semibold text-slate-950">Organiza sobre la marcha</p>
              <p className="mt-1 text-sm text-slate-600">
                Itinerario, gastos, mapa y recursos desde el mismo panel.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => {
              close();
              // Baja al bloque de creación sin depender de refs.
              document.getElementById("create-trip")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className="inline-flex min-h-[44px] items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Crear mi primer viaje
          </button>
          <button
            type="button"
            onClick={close}
            className="inline-flex min-h-[44px] items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Lo veré luego
          </button>
        </div>
      </div>
    </div>
  );
}

