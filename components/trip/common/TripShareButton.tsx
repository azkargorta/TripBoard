"use client";

import { useState } from "react";
import { Share2, Link as LinkIcon, Ban } from "lucide-react";
import { writeTextToClipboard } from "@/lib/clipboard";
import { useToast } from "@/components/ui/toast";

export default function TripShareButton({
  tripId,
  showLabels = false,
}: {
  tripId: string;
  showLabels?: boolean;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

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
      const copied = await writeTextToClipboard(url);
      if (!copied) {
        throw new Error("No se pudo copiar al portapapeles. Copia manualmente el enlace si aparece en pantalla.");
      }
      toast.success("Enlace copiado al portapapeles", "Pégalo donde quieras compartirlo. El enlace es de solo lectura.");
    } catch (e) {
      toast.error("No se pudo compartir", e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    setBusy(true);
    try {
      const resp = await fetch("/api/trip-shares", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tripId }),
      });
      const payload = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(payload?.error || `Error ${resp.status}`);
      toast.info("Enlace revocado", "El link público ya no funcionará.");
    } catch (e) {
      toast.error("No se pudo revocar", e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={createAndCopy}
        disabled={busy}
        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-2 text-[10px] font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60 disabled:opacity-60 sm:min-h-0 sm:min-w-0 sm:py-1"
        title="Crear enlace público (solo lectura) y copiar"
      >
        <Share2 className="h-3.5 w-3.5" aria-hidden />
        <span className={showLabels ? "inline" : "hidden sm:inline"}>Compartir</span>
      </button>

      <button
        type="button"
        onClick={createAndCopy}
        disabled={busy}
        className="hidden"
        aria-hidden
      >
        <LinkIcon className="h-3.5 w-3.5" aria-hidden />
      </button>

      <button
        type="button"
        onClick={revoke}
        disabled={busy}
        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-2 text-[10px] font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60 disabled:opacity-60 sm:min-h-0 sm:min-w-0 sm:py-1"
        title="Revocar enlace público"
      >
        <Ban className="h-3.5 w-3.5" aria-hidden />
        <span className={showLabels ? "inline" : "hidden sm:inline"}>Revocar</span>
      </button>
    </div>
  );
}

