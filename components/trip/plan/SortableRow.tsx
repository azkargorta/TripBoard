"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

/**
 * Drag handle:
 * - Móvil: siempre visible (touch devices no tienen hover)
 * - Desktop: aparece en hover del grupo
 * - Posición: barra flotante a la izquierda fuera de la tarjeta
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
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group relative ${isDragging ? "opacity-40 z-50" : ""}`}
    >
      {/* Drag handle
          - md:opacity-0 md:group-hover:opacity-100  → invisible en desktop, aparece en hover
          - opacity-100 md:opacity-0                 → siempre visible en móvil (<md)
      */}
      <div
        {...attributes}
        {...listeners}
        className="
          absolute -left-2 top-1/2 -translate-y-1/2 z-20
          flex h-10 w-6
          cursor-grab active:cursor-grabbing
          items-center justify-center
          rounded-lg
          bg-white border border-slate-200 shadow-sm
          hover:border-slate-300 hover:shadow
          touch-none select-none
          opacity-100
          md:opacity-0 md:group-hover:opacity-100
          transition-opacity duration-150
        "
        title="Arrastrar para reordenar"
        aria-label="Arrastrar para reordenar"
      >
        <GripVertical className="h-3.5 w-3.5 text-slate-400" />
      </div>

      {children}
    </div>
  );
}
