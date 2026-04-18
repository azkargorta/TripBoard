"use client";

import { Plus, Trash2 } from "lucide-react";

type Props = {
  places: string[];
  onChange: (next: string[]) => void;
  /** Clases del contenedor del grid de campos */
  className?: string;
};

export default function TripPlacesFields({ places, onChange, className = "" }: Props) {
  function setRow(i: number, value: string) {
    onChange(places.map((p, idx) => (idx === i ? value : p)));
  }

  function addRow() {
    onChange([...places, ""]);
  }

  function removeRow(i: number) {
    if (places.length <= 1) return;
    onChange(places.filter((_, idx) => idx !== i));
  }

  return (
    <div className={className}>
      <div className="mb-1 flex flex-wrap items-end justify-between gap-2">
        <label className="block text-sm font-medium">Lugares (ciudades o países)</label>
        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50/80 px-2.5 py-1 text-xs font-semibold text-violet-950 transition hover:bg-violet-50"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Añadir lugar
        </button>
      </div>
      <p className="mb-2 text-xs text-slate-500">
        Un viaje puede recorrer varios sitios: añade cada ciudad o país; se guardan en orden (el asistente y el mapa los verán todos).
      </p>
      <div className="space-y-2">
        {places.map((value, i) => (
          <div key={i} className="flex gap-2">
            <input
              type="text"
              value={value}
              onChange={(e) => setRow(i, e.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
              placeholder={i === 0 ? "Ej. Buenos Aires" : "Ej. Mendoza, Chile, etc."}
              autoComplete="address-level2"
            />
            <button
              type="button"
              onClick={() => removeRow(i)}
              disabled={places.length <= 1}
              className="inline-flex shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:pointer-events-none disabled:opacity-30"
              aria-label={`Quitar lugar ${i + 1}`}
              title="Quitar este lugar"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
