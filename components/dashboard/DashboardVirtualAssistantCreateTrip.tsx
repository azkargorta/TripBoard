"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, X } from "lucide-react";
import type { TripCreationIntent } from "@/lib/trip-ai/tripCreationTypes";
import { btnPrimary, btnNeutral, btnSecondary } from "@/components/ui/brandStyles";
import { iconInline16, iconSlotFill40 } from "@/components/ui/iconTokens";
import TripBoardLogo from "@/components/brand/TripBoardLogo";

type Props = {
  isPremium: boolean;
  disabled?: boolean;
};

type ApiNeedsClarification = {
  status: "needs_clarification";
  question: string;
  code: "destination" | "duration_or_dates";
  draftIntent: TripCreationIntent;
};

type ApiCreated = {
  status: "created" | "partial";
  tripId: string;
  error?: string;
  resolved?: {
    destination: string;
    startDate: string | null;
    endDate: string | null;
    durationDays: number | null;
  };
};

type ApiReady = {
  status: "ready";
  draftIntent: TripCreationIntent;
  resolved: {
    destination: string;
    startDate: string;
    endDate: string;
    durationDays: number;
  };
};

type ApiError = { error: string; code?: string | null; budget?: any };

const SUGGESTED_CHIPS = [
  "Escapada romántica",
  "Viaje barato",
  "Con amigos",
  "Con familia",
  "Solo",
  "Ruta optimizada",
  "Relax",
  "Gastronomía",
  "Cultura y museos",
  "Naturaleza",
  "Playa",
  "Aventura",
  "Road trip",
  "Ciudad + pueblos",
  "Fiesta y noche",
  "Compras",
  "Food tour",
] as const;

function prettyTripDraft(intent: TripCreationIntent | null) {
  if (!intent) return null;
  const dest = (intent.destination || "").trim();
  const dates =
    intent.startDate && intent.endDate
      ? `${intent.startDate} → ${intent.endDate}`
      : intent.durationDays
        ? `${intent.durationDays} días`
        : "";
  const travelers =
    intent.travelersType || intent.travelersCount
      ? `${intent.travelersType || "viajeros"}${intent.travelersCount ? ` · ${intent.travelersCount}` : ""}`
      : "";
  const budget = intent.budgetLevel ? `Presupuesto ${intent.budgetLevel}` : "";
  const style = (intent.travelStyle || []).slice(0, 3).join(" · ");
  const interests = (intent.interests || []).slice(0, 3).join(" · ");
  const startLoc = (intent.startLocation || "").trim();
  const endLoc = (intent.endLocation || "").trim();
  const mustSee = (intent.mustSee || []).slice(0, 4).join(" · ");

  return {
    destination: dest || "—",
    dates: dates || "—",
    travelers: travelers || "—",
    budget: budget || "—",
    style: mustSee || startLoc || endLoc ? "Personalizado" : style || interests || "—",
    startLocation: startLoc || "—",
    endLocation: endLoc || "—",
    mustSee: mustSee || "—",
  };
}

export default function DashboardVirtualAssistantCreateTrip({ isPremium, disabled = false }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draftIntent, setDraftIntent] = useState<TripCreationIntent | null>(null);
  const [question, setQuestion] = useState<string | null>(null);
  const [followUp, setFollowUp] = useState("");
  const [notes, setNotes] = useState("");
  const [aiBudgetExceeded, setAiBudgetExceeded] = useState(false);
  const [stage, setStage] = useState<"collecting" | "clarifying" | "ready">("collecting");

  const panelRef = useRef<HTMLDivElement | null>(null);

  const summary = useMemo(() => prettyTripDraft(draftIntent), [draftIntent]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = panelRef.current;
    if (!el) return;
    const prev = document.activeElement as HTMLElement | null;
    const focusable = el.querySelector<HTMLElement>("textarea, input, button");
    focusable?.focus();
    return () => prev?.focus?.();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/ai-budget/status", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!cancelled && res.ok && data && typeof data?.exceeded === "boolean") {
          setAiBudgetExceeded(Boolean(data.exceeded));
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const canSubmitPrompt = Boolean(prompt.trim()) && !loading && !disabled && !aiBudgetExceeded;
  const canSubmitFollowUp = Boolean(followUp.trim()) && !loading && !disabled && !aiBudgetExceeded;

  function resetFlow() {
    setPrompt("");
    setDraftIntent(null);
    setQuestion(null);
    setFollowUp("");
    setNotes("");
    setError(null);
    setLoading(false);
    setAiBudgetExceeded(false);
    setStage("collecting");
  }

  async function callAutoCreate(params: {
    prompt?: string;
    followUp?: string;
    draftIntent?: TripCreationIntent | null;
    previewOnly?: boolean;
  }) {
    const res = await fetch("/api/trips/auto-create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: params.prompt || "",
        followUp: params.followUp || "",
        draftIntent: params.draftIntent || undefined,
        provider: "gemini",
        previewOnly: Boolean(params.previewOnly),
      }),
    });
    const data = (await res.json().catch(() => null)) as (ApiNeedsClarification | ApiReady | ApiCreated | ApiError | null) & any;
    if (!res.ok) {
      const code = typeof data?.code === "string" ? data.code : null;
      if (code === "AI_BUDGET_EXCEEDED") setAiBudgetExceeded(true);
      throw new Error(typeof data?.error === "string" ? data.error : "No se pudo crear el viaje.");
    }
    return data;
  }

  async function previewFromPrompt() {
    if (!canSubmitPrompt) return;
    setLoading(true);
    setError(null);
    setStage("collecting");
    setQuestion(null);
    setFollowUp("");
    try {
      const data = await callAutoCreate({ prompt: prompt.trim(), draftIntent, previewOnly: true });
      if (data?.status === "needs_clarification") {
        const payload = data as ApiNeedsClarification;
        setDraftIntent(payload.draftIntent || null);
        setQuestion(payload.question || "¿Puedes darme un detalle más?");
        setStage("clarifying");
        return;
      }
      if (data?.status === "ready") {
        const ready = data as ApiReady;
        setDraftIntent(ready.draftIntent || null);
        setQuestion(null);
        setFollowUp("");
        setStage("ready");
        return;
      }
      throw new Error("Respuesta inesperada del servidor.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el viaje.");
    } finally {
      setLoading(false);
    }
  }

  async function previewAnswerFollowUp() {
    if (!canSubmitFollowUp) return;
    setLoading(true);
    setError(null);
    try {
      const data = await callAutoCreate({ followUp: followUp.trim(), draftIntent, previewOnly: true });
      if (data?.status === "needs_clarification") {
        const payload = data as ApiNeedsClarification;
        setDraftIntent(payload.draftIntent || null);
        setQuestion(payload.question || "¿Puedes darme un detalle más?");
        setFollowUp("");
        setStage("clarifying");
        return;
      }
      if (data?.status === "ready") {
        const ready = data as ApiReady;
        setDraftIntent(ready.draftIntent || null);
        setQuestion(null);
        setFollowUp("");
        setStage("ready");
        return;
      }
      throw new Error("Respuesta inesperada del servidor.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el viaje.");
    } finally {
      setLoading(false);
    }
  }

  async function generateTripNow() {
    if (loading || disabled || aiBudgetExceeded) return;
    const intent = draftIntent || null;
    if (!intent) {
      setError("Primero pulsa “Leer lo que he entendido”.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await callAutoCreate({
        followUp: notes.trim(),
        draftIntent: intent,
        previewOnly: false,
      });
      if (data?.status === "created" || data?.status === "partial") {
        const created = data as ApiCreated;
        router.push(`/trip/${encodeURIComponent(created.tripId)}/summary?recien=1`);
        setOpen(false);
        resetFlow();
        return;
      }
      if (data?.status === "needs_clarification") {
        const payload = data as ApiNeedsClarification;
        setDraftIntent(payload.draftIntent || null);
        setQuestion(payload.question || "¿Puedes darme un detalle más?");
        setStage("clarifying");
        return;
      }
      throw new Error("Respuesta inesperada del servidor.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el viaje.");
    } finally {
      setLoading(false);
    }
  }

  function buildRecalcFollowUp(): string {
    const parts: string[] = [];
    const s = (draftIntent?.startLocation || "").trim();
    const e = (draftIntent?.endLocation || "").trim();
    const mustSee = (draftIntent?.mustSee || []).map((x) => String(x || "").trim()).filter(Boolean);
    if (s) parts.push(`Empiezo en: ${s}.`);
    if (e) parts.push(`Termino en: ${e}.`);
    if (mustSee.length) parts.push(`Sitios a visitar: ${mustSee.join(", ")}.`);
    if (notes.trim()) parts.push(`Detalles: ${notes.trim()}`);
    return parts.join(" ");
  }

  async function recalculateDraft() {
    if (loading || disabled || aiBudgetExceeded) return;
    if (!draftIntent) {
      setError("Primero pulsa “Leer lo que he entendido”.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await callAutoCreate({
        followUp: buildRecalcFollowUp(),
        draftIntent,
        previewOnly: true,
      });
      if (data?.status === "needs_clarification") {
        const payload = data as ApiNeedsClarification;
        setDraftIntent(payload.draftIntent || null);
        setQuestion(payload.question || "¿Puedes darme un detalle más?");
        setStage("clarifying");
        return;
      }
      if (data?.status === "ready") {
        const ready = data as ApiReady;
        setDraftIntent(ready.draftIntent || null);
        setQuestion(null);
        setFollowUp("");
        setStage("ready");
        return;
      }
      throw new Error("Respuesta inesperada del servidor.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo recalcular el borrador.");
    } finally {
      setLoading(false);
    }
  }

  if (!mounted) return null;

  if (!isPremium) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (disabled) return;
          setOpen(true);
        }}
        className={`inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl border-2 border-violet-300 bg-violet-50/80 px-3 py-2 text-center text-xs font-semibold text-violet-950 shadow-sm transition hover:bg-violet-50 disabled:opacity-60 sm:w-auto sm:min-w-[320px] sm:text-sm`}
        title="Crea un viaje contando tu idea, sin formularios largos"
      >
        <Sparkles className={`${iconInline16} text-violet-700`} aria-hidden />
        Crear viaje con tu asistente virtual
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[1200] flex items-end justify-center bg-slate-950/40 p-4 sm:items-center"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="virtual-assistant-create-trip-title"
            className="max-h-[min(820px,90vh)] w-full max-w-3xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <TripBoardLogo variant="dark" size="lg" withWordmark className="shrink-0" />
                <div className="min-w-0">
                  <p id="virtual-assistant-create-trip-title" className="text-sm font-extrabold text-slate-900 sm:text-base">
                    Crear viaje con tu asistente virtual
                  </p>
                  <p className="mt-1 text-xs text-slate-600 sm:text-sm">
                    Primero leeré lo que has dicho y te enseñaré un borrador. Después decides si generar el viaje.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  resetFlow();
                }}
                className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition hover:bg-slate-50 ${iconSlotFill40}`}
                aria-label="Cerrar"
              >
                <X aria-hidden />
              </button>
            </div>

            <div className="grid gap-4 overflow-y-auto p-5 md:grid-cols-[1fr_340px] md:p-6">
              <div className="space-y-4">
                {aiBudgetExceeded ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                    <span className="font-semibold">Límite mensual alcanzado.</span> El asistente virtual se reactivará el mes que
                    viene.
                  </div>
                ) : null}

                {stage === "collecting" ? (
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">
                        Cuéntame tu viaje
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        Escribe libremente. Ejemplo: “Roma 4 días con mi pareja, presupuesto medio, nos gusta comer bien y ver
                        monumentos”.
                      </p>
                    </div>

                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      rows={4}
                      disabled={loading || disabled || aiBudgetExceeded}
                      placeholder="Viaje a Lisboa un finde con mi novia, algo barato y tranquilo…"
                      className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
                    />

                    <div className="flex flex-wrap gap-2">
                      {SUGGESTED_CHIPS.map((chip) => (
                        <button
                          key={chip}
                          type="button"
                          disabled={loading || disabled || aiBudgetExceeded}
                          onClick={() => {
                            setPrompt((p) => (p ? `${p.trim()} · ${chip}` : chip));
                          }}
                          className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-900 hover:bg-violet-100 disabled:opacity-60"
                        >
                          {chip}
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <button type="button" onClick={previewFromPrompt} disabled={!canSubmitPrompt} className={btnPrimary}>
                        {loading ? "Leyendo…" : "Leer lo que he entendido"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          resetFlow();
                        }}
                        className={btnNeutral}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : stage === "clarifying" ? (
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-sky-50 p-4">
                      <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-violet-700">
                        Solo una pregunta más
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{question}</p>
                    </div>

                    <input
                      value={followUp}
                      onChange={(e) => setFollowUp(e.target.value)}
                      disabled={loading || disabled || aiBudgetExceeded}
                      placeholder="Ej.: 3 días / del 10 al 12 / 2 días…"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
                    />

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <button type="button" onClick={previewAnswerFollowUp} disabled={!canSubmitFollowUp} className={btnPrimary}>
                        {loading ? "Leyendo…" : "Leer lo que he entendido"}
                      </button>
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => {
                          setStage("collecting");
                          setQuestion(null);
                          setFollowUp("");
                          setError(null);
                        }}
                        className={btnSecondary}
                      >
                        Volver atrás
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                      <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-emerald-800">Borrador listo</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        Revisa el borrador a la derecha y ajusta lo que quieras antes de generar.
                      </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="block text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">
                          Ciudad inicio (opcional)
                        </label>
                        <input
                          value={(draftIntent?.startLocation || "") ?? ""}
                          onChange={(e) =>
                            setDraftIntent((prev) => ({ ...(prev || {}), startLocation: e.target.value.trim() || null }))
                          }
                          disabled={loading || disabled || aiBudgetExceeded}
                          placeholder="Ej.: Madrid"
                          className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">
                          Ciudad fin (opcional)
                        </label>
                        <input
                          value={(draftIntent?.endLocation || "") ?? ""}
                          onChange={(e) =>
                            setDraftIntent((prev) => ({ ...(prev || {}), endLocation: e.target.value.trim() || null }))
                          }
                          disabled={loading || disabled || aiBudgetExceeded}
                          placeholder="Ej.: Barcelona"
                          className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">
                        Sitios a visitar (opcional)
                      </label>
                      <p className="mt-1 text-xs text-slate-600">
                        Puedes escribir lugares concretos para que el borrador los tenga en cuenta (ej.: “Vaticano, Coliseo…”).
                      </p>
                      <textarea
                        value={(draftIntent?.mustSee || []).join("\n")}
                        onChange={(e) => {
                          const raw = e.target.value || "";
                          const items = raw
                            .split(/[,\/\n\r]+/g)
                            .map((x) => x.trim())
                            .filter(Boolean)
                            .slice(0, 12);
                          setDraftIntent((prev) => ({ ...(prev || {}), mustSee: items.length ? items : undefined }));
                        }}
                        disabled={loading || disabled || aiBudgetExceeded}
                        placeholder={"Ej. (uno por línea):\nColiseo\nVaticano\nTrastevere"}
                        rows={3}
                        className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">
                        Añadir detalles (opcional)
                      </label>
                      <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows={3}
                        disabled={loading || disabled || aiBudgetExceeded}
                        placeholder="Ej.: ritmo tranquilo, evitar madrugar, 2 restaurantes buenos…"
                        className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
                      />
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <button
                        type="button"
                        onClick={generateTripNow}
                        disabled={loading || disabled || aiBudgetExceeded}
                        className={btnPrimary}
                      >
                        {loading ? "Creando…" : "Generar viaje"}
                      </button>
                      <button
                        type="button"
                        onClick={recalculateDraft}
                        disabled={loading || disabled || aiBudgetExceeded}
                        className={btnSecondary}
                      >
                        {loading ? "Recalculando…" : "Recalcular viaje"}
                      </button>
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => {
                          setStage("collecting");
                          setDraftIntent(null);
                          setQuestion(null);
                          setFollowUp("");
                          setNotes("");
                          setError(null);
                        }}
                        className={btnSecondary}
                      >
                        Editar texto
                      </button>
                    </div>
                  </div>
                )}

                {error ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                    {error}
                  </div>
                ) : null}
              </div>

              <div className="space-y-3">
                <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Resumen</p>
                  {summary ? (
                    <div className="mt-3 space-y-2 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-500">Inicio</span>
                        <span className="font-semibold text-slate-900">{summary.startLocation}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-500">Fin</span>
                        <span className="font-semibold text-slate-900">{summary.endLocation}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-500">Destino</span>
                        <span className="font-semibold text-slate-900">{summary.destination}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-500">Fechas / duración</span>
                        <span className="font-semibold text-slate-900">{summary.dates}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-500">Viajeros</span>
                        <span className="font-semibold text-slate-900">{summary.travelers}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-500">Presupuesto</span>
                        <span className="font-semibold text-slate-900">{summary.budget}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-500">Estilo</span>
                        <span className="font-semibold text-slate-900">{summary.style}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-500">Sitios</span>
                        <span className="font-semibold text-slate-900">{summary.mustSee}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-slate-600">
                      Aquí verás lo que el asistente virtual ha entendido cuando pulses <span className="font-semibold">Leer lo que he entendido</span>.
                    </p>
                  )}
                </div>

                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
                  <p className="font-semibold text-slate-800">Cómo funciona</p>
                  <p className="mt-1">
                    1) Escribes tu idea. 2) El asistente virtual crea un borrador y te lo enseña. 3) Si te gusta, generas el viaje.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

