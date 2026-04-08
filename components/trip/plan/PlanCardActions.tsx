"use client";

import { ExternalLink, Pencil, Trash2 } from "lucide-react";

type Props<T> = {
  googleMapsUrl?: string | null;
  onEdit?: (item: T) => void;
  onDelete?: (item: T) => void;
  item: T;
  accent?: "emerald" | "violet" | "slate";
  /** Si no hay permisos (p.ej. sincronizado), mantenemos los botones pero deshabilitados */
  disableEdit?: boolean;
  disableDelete?: boolean;
  disabledReason?: string;
};

export default function PlanCardActions<T>({
  googleMapsUrl,
  onEdit,
  onDelete,
  item,
  accent = "slate",
  disableEdit = false,
  disableDelete = false,
  disabledReason,
}: Props<T>) {
  const mapsClass =
    accent === "violet"
      ? "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100"
      : accent === "emerald"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
        : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100";

  const btnBase =
    "inline-flex min-h-[36px] items-center gap-2 rounded-xl border px-3 text-xs font-extrabold transition focus:outline-none focus:ring-2 focus:ring-violet-200";

  const disabled =
    "opacity-55 cursor-not-allowed hover:bg-white hover:text-slate-900";

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {googleMapsUrl ? (
        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noreferrer"
          className={`${btnBase} ${mapsClass}`}
        >
          <ExternalLink className="h-4 w-4" aria-hidden />
          Google Maps
        </a>
      ) : (
        <div className={`${btnBase} border-slate-200 bg-slate-50 text-slate-400`} aria-hidden>
          <ExternalLink className="h-4 w-4" aria-hidden />
          Google Maps
        </div>
      )}

      <button
        type="button"
        onClick={() => (onEdit && !disableEdit ? onEdit(item) : null)}
        disabled={!onEdit || disableEdit}
        title={!onEdit || disableEdit ? disabledReason ?? "No editable" : "Editar"}
        className={`${btnBase} border-slate-300 bg-white text-slate-900 hover:bg-slate-50 ${(!onEdit || disableEdit) ? disabled : ""}`}
      >
        <Pencil className="h-4 w-4" aria-hidden />
        Editar
      </button>

      <button
        type="button"
        onClick={() => (onDelete && !disableDelete ? onDelete(item) : null)}
        disabled={!onDelete || disableDelete}
        title={!onDelete || disableDelete ? disabledReason ?? "No borrable" : "Borrar"}
        className={`${btnBase} border-red-200 bg-red-50 text-red-700 hover:bg-red-100 ${(!onDelete || disableDelete) ? disabled : ""}`}
      >
        <Trash2 className="h-4 w-4" aria-hidden />
        Borrar
      </button>
    </div>
  );
}

