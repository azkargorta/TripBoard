"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

/**
 * Fix 2 — Drag handle rediseñado:
 * - Desaparece el punto duplicado de la timeline (quitado en TripPlanView)
 * - Handle visible en la esquina superior izquierda de la tarjeta,
 *   fuera del contenido, con zona de toque amplia y feedback visual claro.
 */
export function SortableRow({
  id,
  color,
  children,
}: {
  id: string;
  color: string;
  children: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`group relative transition-opacity ${isDragging ? "opacity-40 z-50" : "opacity-100"}`}
    >
      {/* Drag handle — barra vertical a la izquierda, visible en hover */}
      <div
        {...attributes}
        {...listeners}
        className={`
          absolute -left-1 top-1/2 -translate-y-1/2 z-20
          flex h-10 w-5 cursor-grab active:cursor-grabbing
          items-center justify-center
          rounded-lg
          opacity-0 group-hover:opacity-100
          transition-opacity duration-150
          touch-none select-none
          bg-white border border-slate-200 shadow-sm
          hover:border-slate-300 hover:shadow-md
        `}
        title="Arrastrar para reordenar"
        aria-label="Arrastrar para reordenar"
      >
        <GripVertical className="h-3.5 w-3.5 text-slate-400" />
      </div>

      {children}
    </div>
  );
}
