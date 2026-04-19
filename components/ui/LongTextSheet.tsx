"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { X } from "lucide-react";

type Variant = "block" | "link";

type Props = {
  text: string;
  modalTitle?: string;
  minLength?: number;
  /** `block`: vista previa recortada tocable; `link`: solo enlace «Ver texto completo» (el padre muestra el texto) */
  variant?: Variant;
  lineClamp?: number;
  className?: string;
  linkLabel?: string;
};

function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [locked]);
}

export default function LongTextSheet({
  text,
  modalTitle = "Texto completo",
  minLength = 48,
  variant = "block",
  lineClamp = 5,
  className = "",
  linkLabel = "Ver texto completo",
}: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useBodyScrollLock(open && mounted);

  useEffect(() => {
    setMounted(true);
  }, []);

  const trimmed = (text ?? "").trim();
  const showExpand = trimmed.length >= minLength;

  const modal =
    mounted && open ? (
      <div
        className="fixed inset-0 z-[2100] flex items-center justify-center p-3 py-[max(1rem,env(safe-area-inset-bottom))] sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="long-text-sheet-title"
      >
        <button
          type="button"
          className="absolute inset-0 bg-slate-950/50 backdrop-blur-[1px]"
          aria-label="Cerrar"
          onClick={() => setOpen(false)}
        />
        <div className="relative max-h-[min(85dvh,640px)] w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xl ring-1 ring-slate-900/[0.06]">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-slate-50/80 to-cyan-50/40 px-4 py-3">
            <h2 id="long-text-sheet-title" className="min-w-0 truncate text-base font-extrabold text-slate-950">
              {modalTitle}
            </h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-cyan-200 hover:bg-cyan-50/80"
              aria-label="Cerrar"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
          <div className="max-h-[min(70dvh,520px)] overflow-y-auto overscroll-y-contain px-4 py-4">
            <p className="whitespace-pre-wrap break-words text-base leading-relaxed text-slate-800">{text}</p>
          </div>
        </div>
      </div>
    ) : null;

  if (!showExpand) {
    if (variant === "link") return null;
    return <span className={`whitespace-pre-wrap break-words ${className}`.trim()}>{text}</span>;
  }

  const clampStyle = {
    display: "-webkit-box",
    WebkitBoxOrient: "vertical" as const,
    WebkitLineClamp: lineClamp,
    overflow: "hidden",
  } as const;

  if (variant === "link") {
    return (
      <>
        <button
          type="button"
          className={`mt-1 text-left text-xs font-semibold text-violet-700 underline decoration-violet-300 decoration-dotted underline-offset-2 hover:text-violet-900 md:hidden ${className}`.trim()}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
        >
          {linkLabel}
        </button>
        {modal ? createPortal(modal, document.body) : null}
      </>
    );
  }

  return (
    <>
      <div className={`hidden whitespace-pre-wrap break-words md:block ${className}`.trim()}>{text}</div>
      <button
        type="button"
        className={`w-full rounded-lg border border-transparent bg-transparent px-1 py-0.5 text-left font-inherit text-slate-900 transition hover:border-slate-200 hover:bg-slate-50 active:bg-slate-100 md:hidden ${className}`.trim()}
        style={clampStyle}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label={`${modalTitle}: abrir lectura ampliada`}
      >
        <span className="whitespace-pre-wrap break-words">{text}</span>
      </button>
      {modal ? createPortal(modal, document.body) : null}
    </>
  );
}
