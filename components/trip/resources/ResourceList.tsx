"use client";

import type { TripResource } from "@/hooks/useTripResources";

export default function ResourceList({
  resources,
  onDelete,
}: {
  resources: TripResource[];
  onDelete: (resourceId: string) => void;
}) {
  return (
    <div className="min-w-0 max-w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-900">Documentos y reservas adjuntas</h3>
        <p className="mt-1 text-sm text-slate-500">
          Imágenes y PDFs subidos al viaje.
        </p>
      </div>

      {resources.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500">
          Todavía no hay documentos subidos.
        </div>
      ) : (
        <div className="space-y-3">
          {resources.map((resource) => (
            <div key={resource.id} className="min-w-0 rounded-2xl border border-slate-200 p-3 sm:p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-3">
                <div className="min-w-0 max-w-full flex-1 break-words">
                  <div className="font-semibold text-slate-900">{resource.title}</div>
                  <div className="mt-1 break-words text-sm text-slate-500">
                    {resource.resource_type} {resource.mime_type ? `· ${resource.mime_type}` : ""}
                  </div>
                  {resource.file_url ? (
                    <a
                      href={resource.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block max-w-full break-all text-sm text-blue-600 underline"
                    >
                      Abrir archivo
                    </a>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={() => onDelete(resource.id)}
                  className="shrink-0 self-start rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 sm:self-auto"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
