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

export default function ResourceCard({ item, onOpen, onDelete }: Props) {
  const title = item.title || item.file_name || "Documento";
  const fileType = item.type || "archivo";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            <span>📎</span>
            <span>{fileType}</span>
          </div>

          <h4 className="mt-3 truncate text-base font-semibold text-slate-950">{title}</h4>
          {item.created_at ? <p className="mt-2 text-sm text-slate-500">{item.created_at}</p> : null}
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
