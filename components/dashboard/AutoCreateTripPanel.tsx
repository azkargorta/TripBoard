"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import type { TripCreationIntent } from "@/lib/trip-ai/tripCreationTypes";

/** Alineado con `maxDuration` del endpoint (300s); margen para red + JSON. */
const AUTO_CREATE_FETCH_MS = 180_000;

function isAbortError(e: unknown): boolean {
  return typeof e === "object" && e !== null && "name" in e && (e as { name: string }).name === "AbortError";
}

const CHIPS = [
  "Escapada romántica a Florencia 3 días",
  "Viaje barato 5 días con amigos, playa y comida local",
  "Ruta optimizada 4 días, muchos monumentos",
  "Fin de semana tranquilo en Lisboa en pareja",
  "Viaje gastronómico 6 días presupuesto medio",
];

export default function AutoCreateTripPanel() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [clarification, setClarification] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [followQuestion, setFollowQuestion] = useState<string | null>(null);
  const [draftIntent, setDraftIntent] = useState<TripCreationIntent | null>(null);

  async function submit(body: Record<string, unknown>) {
    setLoading(true);
    setError(null);
    setInfo(null);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), AUTO_CREATE_FETCH_MS);
    try {
      const res = await fetch("/api/trips/auto-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const ct = res.headers.get("content-type") || "";
      const data =
        ct.includes("application/json") || ct.includes("text/json")
          ? await res.json().catch(() => null)
          : null;
      if (!res.ok) {
        throw new Error(data?.error || "No se pudo procesar la solicitud.");
      }

      if (data?.status === "needs_clarification") {
        setFollowQuestion(typeof data.question === "string" ? data.question : "¿Puedes concretar un poco más?");
        setDraftIntent((data.draftIntent as TripCreationIntent) || null);
        setClarification("");
        return;
      }

      const tripId = typeof data?.tripId === "string" ? data.tripId : "";
      if (!tripId) throw new Error("No se recibió el id del viaje.");

      if (data?.status === "partial") {
        router.push(`/trip/${encodeURIComponent(tripId)}`);
        router.refresh();
        return;
      }

      const nAct = typeof data?.createdActivities === "number" ? data.createdActivities : null;
      const nRoutes = typeof data?.routesCreated === "number" ? data.routesCreated : null;
      setInfo(
        [
          "Viaje creado.",
          nAct != null ? `${nAct} actividades en el plan.` : "",
          nRoutes != null && nRoutes > 0 ? `${nRoutes} rutas en el mapa.` : "",
        ]
          .filter(Boolean)
          .join(" ")
      );
      router.push(`/trip/${encodeURIComponent(tripId)}/ai-chat?recien=1`);
      router.refresh();
    } catch (e) {
      if (isAbortError(e)) {
        setError(
          "La generación tardó demasiado (el servidor puede estar ocupado). Prueba con menos días o inténtalo de nuevo en unos minutos."
        );
      } else {
        setError(e instanceof Error ? e.message : "Error inesperado.");
      }
    } finally {
      window.clearTimeout(timeoutId);
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-violet-200/90 bg-gradient-to-br from-violet-50 via-white to-cyan-50/40 p-5 shadow-sm md:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-violet-900">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          Nuevo · Premium
        </span>
      </div>
      <h2 className="mt-3 text-lg font-extrabold tracking-tight text-slate-950 md:text-xl">Cuéntame tu viaje y te lo organizo</h2>
      <p className="mt-1 text-sm text-slate-600">
        Una frase basta: destino, días o fechas, ritmo y presupuesto. Si falta algo clave, te haré una sola pregunta corta. Con muchos días y rutas puede tardar hasta un par de minutos.
      </p>

      {error ? (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
          {error}
        </div>
      ) : null}
      {info ? (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {info}
        </div>
      ) : null}

      {followQuestion ? (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950">
            {followQuestion}
          </div>
          <label className="block text-xs font-semibold text-slate-700">
            Tu respuesta
            <textarea
              value={clarification}
              onChange={(e) => setClarification(e.target.value)}
              rows={2}
              className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
              placeholder="Ej.: 4 días / del 10 al 14 de mayo / solo Roma…"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={loading || !clarification.trim() || !draftIntent}
              onClick={() => void submit({ followUp: clarification.trim(), draftIntent })}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {loading ? "Generando…" : "Continuar"}
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                setFollowQuestion(null);
                setDraftIntent(null);
                setClarification("");
              }}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Empezar de nuevo
            </button>
          </div>
        </div>
      ) : (
        <>
          <label className="mt-4 block text-xs font-semibold text-slate-700">
            Describe el viaje
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              disabled={loading}
              className="mt-1 min-h-[120px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100 disabled:opacity-60"
              placeholder="Ej.: Viaje a Roma 4 días con mi pareja, presupuesto medio, nos gusta comer bien y ver monumentos."
            />
          </label>

          <div className="mt-3 flex flex-wrap gap-2">
            {CHIPS.map((c) => (
              <button
                key={c}
                type="button"
                disabled={loading}
                onClick={() => setText((prev) => (prev.trim() ? `${prev.trim()}\n` : "") + c)}
                className="rounded-full border border-violet-200 bg-white px-3 py-1.5 text-left text-[11px] font-semibold text-violet-900 transition hover:bg-violet-50 disabled:opacity-50"
              >
                {c}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={loading || !text.trim()}
            onClick={() => void submit({ prompt: text.trim() })}
            className="mt-4 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-cyan-600 px-5 py-3 text-sm font-bold text-white shadow-md transition hover:from-violet-500 hover:to-cyan-500 disabled:opacity-50 sm:w-auto"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Sparkles className="h-5 w-5" aria-hidden />}
            {loading ? "Creando viaje…" : "Crear viaje automático"}
          </button>
          <p className="mt-2 text-[11px] text-slate-500">
            Si el botón sigue cargando mucho rato, en cuanto termine verás un mensaje o te redirigiré al viaje.
          </p>
        </>
      )}
    </div>
  );
}
