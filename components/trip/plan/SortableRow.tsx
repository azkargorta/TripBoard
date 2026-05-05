"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

export function SortableRow({
  id,
  color,
  children,
}: {
  id: string;
  color: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="relative"
    >
      <span
        className="absolute -left-[21px] top-6 h-3 w-3 rounded-full border border-white"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      <div
        {...attributes}
        {...listeners}
        className="absolute right-2 top-3 z-10 cursor-grab p-1 text-slate-300 hover:text-slate-500 active:cursor-grabbing touch-none"
        title="Arrastrar para reordenar"
      >
        <GripVertical className="h-4 w-4" />
      </div>
      {children}
    </div>
  );
}
