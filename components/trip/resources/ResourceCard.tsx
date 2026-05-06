"use client";

type ResourceItem = {
  id: string;
  title?: string | null;
  file_name?: string | null;
  type?: string | null;
  created_at?: string | null;
  url?: string | null;
};

type Props = {
  item: ResourceItem;
  onOpen?: (item: ResourceItem) => void;
  onDelete?: (item: ResourceItem) => void;
};

// D1 — File type with semantic color
function fileTypeMeta(type: string | null | undefined) {
  const t = (type || "").toLowerCase();
  if (t.includes("pdf")) return { icon: "📄", bg: "bg-red-100", text: "text-red-800", label: "PDF" };
  if (t.includes("image") || t.includes("jpg") || t.includes("jpeg") || t.includes("png") || t.includes("webp"))
    return { icon: "🖼️", bg: "bg-blue-100", text: "text-blue-800", label: "Imagen" };
  if (t.includes("doc") || t.includes("word"))
    return { icon: "📝", bg: "bg-violet-100", text: "text-violet-800", label: "Documento" };
  if (t.includes("xls") || t.includes("sheet") || t.includes("csv"))
    return { icon: "📊", bg: "bg-emerald-100", text: "text-emerald-800", label: "Hoja de cálculo" };
  if (t.includes("zip") || t.includes("rar"))
    return { icon: "📦", bg: "bg-amber-100", text: "text-amber-800", label: "Archivo" };
  return { icon: "📎", bg: "bg-slate-100", text: "text-slate-700", label: type || "Archivo" };
}

export default function ResourceCard({ item, onOpen, onDelete }: Props) {
  const title = item.title || item.file_name || "Documento";
  const meta = fileTypeMeta(item.type || item.file_name?.split(".").pop());

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md hover:border-slate-300">
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0 flex-1 flex items-start gap-3">
          {/* D1 — Semantic file type icon */}
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg ${meta.bg}`}>
            {meta.icon}
          </div>
          <div className="min-w-0 flex-1">
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${meta.bg} ${meta.text}`}>
              {meta.label}
            </span>
            <h4 className="mt-1.5 truncate text-sm font-semibold text-slate-950">{title}</h4>
            {item.created_at ? <p className="mt-0.5 text-xs text-slate-400">{item.created_at}</p> : null}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {item.url ? (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900"
          >
            Abrir
          </a>
        ) : onOpen ? (
          <button
            type="button"
            onClick={() => onOpen(item)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900"
          >
            Abrir
          </button>
        ) : null}
        {onDelete ? (
          <button
            type="button"
            onClick={() => onDelete(item)}
            className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700"
          >
            Borrar
          </button>
        ) : null}
      </div>
    </div>
  );
}
