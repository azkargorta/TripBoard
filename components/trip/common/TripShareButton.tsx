"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link2 } from "lucide-react";
import { writeTextToClipboard } from "@/lib/clipboard";
import { useToast } from "@/components/ui/toast";
import { mobileMenuRowBase, mobileMenuRowIconWrap } from "@/components/ui/mobileMenuStyles";
import { iconInline16 } from "@/components/ui/iconTokens";

function isMobileViewport() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 767px)").matches;
}

export default function TripShareButton({
  tripId,
  showLabels = false,
  menuRow = false,
}: {
  tripId: string;
  showLabels?: boolean;
  /** Fila ancha tipo menú móvil (viaje). */
  menuRow?: boolean;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [shareModalUrl, setShareModalUrl] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const urlFieldRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!shareModalUrl) return;
    const id = window.requestAnimationFrame(() => {
      const el = urlFieldRef.current;
      if (!el) return;
      el.focus();
      el.select();
      el.setSelectionRange(0, el.value.length);
    });
    return () => window.cancelAnimationFrame(id);
  }, [shareModalUrl]);

  useEffect(() => {
    if (!shareModalUrl) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [shareModalUrl]);

  async function createAndCopy() {
    setBusy(true);
    try {
      const resp = await fetch("/api/trip-shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tripId }),
      });
      const payload = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(payload?.error || `Error ${resp.status}`);
      const token = String(payload?.share?.token || "");
      if (!token) throw new Error("No se pudo crear el enlace.");

      const url = `${window.location.origin}/share/${token}`;

      if (isMobileViewport()) {
        setShareModalUrl(url);
        return;
      }

      const copied = await writeTextToClipboard(url);
      if (!copied) {
        try {
          window.prompt("Copia el enlace público (solo lectura). Selecciónalo y usa «Copiar» del sistema:", url);
        } catch {
          /* */
        }
        toast.info("Copia el enlace a mano", url);
        return;
      }
      toast.success("Enlace copiado al portapapeles", "Pégalo donde quieras compartirlo. El enlace es de solo lectura.");
    } catch (e) {
      toast.error("No se pudo compartir", e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setBusy(false);
    }
  }

  async function confirmCopyFromModal() {
    if (!shareModalUrl) return;
    const copied = await writeTextToClipboard(shareModalUrl);
    if (copied) {
      toast.success("Enlace copiado", "Ya puedes pegarlo donde quieras.");
      setShareModalUrl(null);
    } else {
      toast.error("No se pudo copiar", "Mantén pulsado el texto, elige «Seleccionar todo» y luego «Copiar» del menú del sistema.");
    }
  }

  function closeModal() {
    setShareModalUrl(null);
  }

  const modal =
    mounted && shareModalUrl ? (
      <div
        className="fixed inset-0 z-[2000] flex items-center justify-center p-3 py-[max(1rem,env(safe-area-inset-bottom))] sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="trip-share-modal-title"
      >
        <button
          type="button"
          className="absolute inset-0 bg-slate-950/50 backdrop-blur-[1px]"
          aria-label="Cerrar"
          onClick={closeModal}
        />
        <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl sm:p-5">
          <h2 id="trip-share-modal-title" className="text-base font-extrabold text-slate-950">
            Enlace público (solo lectura)
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            El texto está seleccionado. Pulsa <span className="font-semibold text-slate-800">Copiar</span> para guardarlo en el
            portapapeles.
          </p>
          <textarea
            ref={urlFieldRef}
            readOnly
            value={shareModalUrl}
            rows={4}
            className="mt-3 w-full resize-none break-all rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[13px] leading-snug text-slate-900 outline-none ring-violet-200 focus:ring-2"
            onFocus={(e) => {
              e.target.select();
              e.target.setSelectionRange(0, e.target.value.length);
            }}
          />

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={closeModal}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 sm:w-auto"
            >
              Cerrar
            </button>
            <button
              type="button"
              onClick={() => void confirmCopyFromModal()}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 sm:w-auto"
            >
              Copiar
            </button>
          </div>
        </div>
      </div>
    ) : null;

  const compactBtn =
    "inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-2 text-[10px] font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60 disabled:opacity-60 sm:min-h-0 sm:min-w-0 sm:px-2 sm:py-1";

  const menuBtn = `${mobileMenuRowBase} text-left disabled:opacity-60`;
  const desktopIconTile =
    "inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-slate-100 shadow-sm ring-1 ring-slate-900/[0.04]";

  return (
    <>
      <div className={menuRow ? "w-full" : "flex flex-wrap gap-2"}>
        <button
          type="button"
          onClick={() => void createAndCopy()}
          disabled={busy}
          className={menuRow ? menuBtn : compactBtn}
          title="Crear enlace público (solo lectura) y copiarlo al portapapeles"
        >
          {menuRow ? (
            <span className={mobileMenuRowIconWrap}>
              <Link2 className="text-violet-700" aria-hidden />
            </span>
          ) : (
            <span className={desktopIconTile} aria-hidden>
              <Link2 className="h-5 w-5 text-slate-900" aria-hidden />
            </span>
          )}
          <span className={menuRow || showLabels ? "inline" : "inline max-w-[9rem] truncate sm:max-w-none"}>Copiar enlace</span>
        </button>
      </div>

      {modal ? createPortal(modal, document.body) : null}
    </>
  );
}
