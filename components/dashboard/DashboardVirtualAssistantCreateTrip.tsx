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
  const travelersTypeLabel =
    intent.travelersType === "solo"
      ? "Solo"
      : intent.travelersType === "couple"
        ? "Pareja"
        : intent.travelersType === "friends"
          ? "Amigos"
          : intent.travelersType === "family"
            ? "Familia"
            : "";
  const travelers =
    travelersTypeLabel || intent.travelersCount
      ? `${travelersTypeLabel || "Viajeros"}${intent.travelersCount ? ` · ${intent.travelersCount}` : ""}`
      : "";
  const budgetLabel =
    intent.budgetLevel === "low"
      ? "bajo"
      : intent.budgetLevel === "medium"
        ? "medio"
        : intent.budgetLevel === "high"
          ? "alto"
          : "";
  const budget = budgetLabel ? `Presupuesto ${budgetLabel}` : "";
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
  const [mustSeeText, setMustSeeText] = useState("");
  const [optimizeOrder, setOptimizeOrder] = useState(true);
  const [aiBudgetExceeded, setAiBudgetExceeded] = useState(false);
  const [stage, setStage] = useState<"collecting" | "clarifying" | "ready">("collecting");

  const panelRef = useRef<HTMLDivElement | null>(null);

  const summary = useMemo(() => prettyTripDraft(draftIntent), [draftIntent]);

  // Botones un poco más estilizados (menos “bastos”) para este modal, sin afectar al resto de la app.
  const btnPrimarySlim =
    "inline-flex min-h-[42px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-br from-violet-600 via-violet-600 to-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm ring-1 ring-white/10 transition hover:brightness-[0.98] hover:shadow-md active:translate-y-[0.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200 disabled:cursor-not-allowed disabled:opacity-60";
  const btnSecondarySlim =
    "inline-flex min-h-[42px] items-center justify-center gap-2 rounded-2xl border border-violet-200 bg-white px-5 py-2 text-sm font-semibold text-violet-950 shadow-sm ring-1 ring-slate-900/[0.02] transition hover:bg-violet-50 active:translate-y-[0.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200 disabled:cursor-not-allowed disabled:opacity-60";
  const btnNeutralSlim =
    "inline-flex min-h-[42px] items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-2 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-900/[0.02] transition hover:bg-slate-50 active:translate-y-[0.5px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-200 disabled:cursor-not-allowed disabled:opacity-60";

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
    setMustSeeText("");
    setOptimizeOrder(true);
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
      const data = await callAutoCreate({
        prompt: prompt.trim(),
        draftIntent: { ...(draftIntent || {}), wantsRouteOptimization: optimizeOrder },
        previewOnly: true,
      });
      if (data?.status === "needs_clarification") {
        const payload = data as ApiNeedsClarification;
        setDraftIntent(payload.draftIntent || null);
        setOptimizeOrder(Boolean(payload.draftIntent?.wantsRouteOptimization ?? optimizeOrder));
        setQuestion(payload.question || "¿Puedes darme un detalle más?");
        setStage("clarifying");
        return;
      }
      if (data?.status === "ready") {
        const ready = data as ApiReady;
        setDraftIntent(ready.draftIntent || null);
        setMustSeeText((ready.draftIntent?.mustSee || []).join("\n"));
        setOptimizeOrder(Boolean(ready.draftIntent?.wantsRouteOptimization));
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
      const data = await callAutoCreate({
        followUp: followUp.trim(),
        draftIntent: { ...(draftIntent || {}), wantsRouteOptimization: optimizeOrder },
        previewOnly: true,
      });
      if (data?.status === "needs_clarification") {
        const payload = data as ApiNeedsClarification;
        setDraftIntent(payload.draftIntent || null);
        setOptimizeOrder(Boolean(payload.draftIntent?.wantsRouteOptimization ?? optimizeOrder));
        setQuestion(payload.question || "¿Puedes darme un detalle más?");
        setFollowUp("");
        setStage("clarifying");
        return;
      }
      if (data?.status === "ready") {
        const ready = data as ApiReady;
        setDraftIntent(ready.draftIntent || null);
        setMustSeeText((ready.draftIntent?.mustSee || []).join("\n"));
        setOptimizeOrder(Boolean(ready.draftIntent?.wantsRouteOptimization));
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
        draftIntent: { ...intent, wantsRouteOptimization: optimizeOrder },
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
        setOptimizeOrder(Boolean(payload.draftIntent?.wantsRouteOptimization ?? optimizeOrder));
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
    parts.push(`Optimizar orden: ${draftIntent?.wantsRouteOptimization ? "sí" : "no"}.`);
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
        draftIntent: { ...(draftIntent || {}), wantsRouteOptimization: optimizeOrder },
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
        setMustSeeText((ready.draftIntent?.mustSee || []).join("\n"));
        setOptimizeOrder(Boolean(ready.draftIntent?.wantsRouteOptimization));
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
          className="fixed inset-0 z-[1200] flex items-end justify-center bg-slate-950/50 p-4 backdrop-blur-sm sm:items-center"
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
            className="max-h-[min(860px,92vh)] w-full max-w-3xl overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-white to-slate-50 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200/70 bg-white/70 px-5 py-4 backdrop-blur sm:px-6">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <TripBoardLogo variant="dark" size="lg" withWordmark className="shrink-0" />
                <div className="min-w-0">
                  <p
                    id="virtual-assistant-create-trip-title"
                    className="text-sm font-extrabold tracking-tight text-slate-950 sm:text-base"
                  >
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

            <div className="grid gap-4 overflow-y-auto p-5 md:grid-cols-[1fr_340px] md:gap-5 md:p-6">
              <div className="space-y-4">
                {error ? (
                  <div className="sticky top-0 z-10 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 shadow-sm">
                    <span className="font-semibold">Error:</span> {error}
                  </div>
                ) : null}

                {aiBudgetExceeded ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                    <span className="font-semibold">Límite mensual alcanzado.</span> El asistente virtual se reactivará el mes que
                    viene.
                  </div>
                ) : null}

                {stage === "collecting" ? (
                  <div className="space-y-3 rounded-3xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur sm:p-5">
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
                      <button type="button" onClick={previewFromPrompt} disabled={!canSubmitPrompt} className={btnPrimarySlim}>
                        {loading ? "Leyendo…" : "Leer lo que he entendido"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          resetFlow();
                        }}
                        className={btnNeutralSlim}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : stage === "clarifying" ? (
                  <div className="space-y-3 rounded-3xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur sm:p-5">
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
                      <button
                        type="button"
                        onClick={previewAnswerFollowUp}
                        disabled={!canSubmitFollowUp}
                        className={btnPrimarySlim}
                      >
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
                        className={btnSecondarySlim}
                      >
                        Volver atrás
                      </button>
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => {
                          setOpen(false);
                          resetFlow();
                        }}
                        className={btnNeutralSlim}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 rounded-3xl border border-slate-200 bg-white/80 p-4 shadow-sm backdrop-blur sm:p-5">
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
                        value={mustSeeText}
                        onChange={(e) => {
                          const raw = e.target.value ?? "";
                          setMustSeeText(raw);
                          // Parseamos para el borrador, pero sin “machacar” el texto tecleado (espacios/saltos).
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
                      {draftIntent?.mustSee?.length ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {(draftIntent.mustSee || []).map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              disabled={loading || disabled || aiBudgetExceeded}
                              onClick={() => {
                                const next = (draftIntent.mustSee || []).filter((x) => x !== tag);
                                setDraftIntent((prev) => ({ ...(prev || {}), mustSee: next.length ? next : undefined }));
                                setMustSeeText(next.join("\n"));
                              }}
                              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
                              title="Quitar"
                            >
                              <span className="max-w-[240px] truncate">{tag}</span>
                              <span className="text-slate-400">×</span>
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-violet-600"
                        checked={optimizeOrder}
                        disabled={loading || disabled || aiBudgetExceeded}
                        onChange={(e) => {
                          const v = Boolean(e.target.checked);
                          setOptimizeOrder(v);
                          setDraftIntent((prev) => ({ ...(prev || {}), wantsRouteOptimization: v }));
                        }}
                      />
                      <span className="min-w-0">
                        <span className="font-semibold text-slate-950">Optimizar orden</span>{" "}
                        <span className="text-slate-600">(si hay varias ciudades, reduce idas y vueltas)</span>
                      </span>
                    </label>

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
                        className={btnPrimarySlim}
                      >
                        {loading ? "Creando…" : "Generar viaje"}
                      </button>
                      <button
                        type="button"
                        onClick={recalculateDraft}
                        disabled={loading || disabled || aiBudgetExceeded}
                        className={btnSecondarySlim}
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
                          setMustSeeText("");
                          setError(null);
                        }}
                        className={btnSecondarySlim}
                      >
                        Editar texto
                      </button>
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => {
                          setOpen(false);
                          resetFlow();
                        }}
                        className={btnNeutralSlim}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {/* el error se muestra arriba en sticky */}
              </div>

              <div className="space-y-3 md:sticky md:top-4 md:self-start">
                <div className="rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur">
                  <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Resumen</p>
                  {summary ? (
                    <dl className="mt-3 divide-y divide-slate-100 text-sm">
                      <div className="flex items-start gap-3 py-2">
                        <dt className="w-[120px] shrink-0 text-slate-500">Inicio</dt>
                        <dd className="min-w-0 flex-1 text-right font-semibold text-slate-950 break-words">
                          {summary.startLocation}
                        </dd>
                      </div>
                      <div className="flex items-start gap-3 py-2">
                        <dt className="w-[120px] shrink-0 text-slate-500">Fin</dt>
                        <dd className="min-w-0 flex-1 text-right font-semibold text-slate-950 break-words">
                          {summary.endLocation}
                        </dd>
                      </div>
                      <div className="flex items-start gap-3 py-2">
                        <dt className="w-[120px] shrink-0 text-slate-500">Destino</dt>
                        <dd className="min-w-0 flex-1 text-right font-semibold text-slate-950 break-words">
                          {summary.destination}
                        </dd>
                      </div>
                      <div className="flex items-start gap-3 py-2">
                        <dt className="w-[120px] shrink-0 text-slate-500">Fechas / duración</dt>
                        <dd className="min-w-0 flex-1 text-right font-semibold text-slate-950 break-words">
                          {summary.dates}
                        </dd>
                      </div>
                      <div className="flex items-start gap-3 py-2">
                        <dt className="w-[120px] shrink-0 text-slate-500">Viajeros</dt>
                        <dd className="min-w-0 flex-1 text-right font-semibold text-slate-950 break-words">
                          {summary.travelers}
                        </dd>
                      </div>
                      <div className="flex items-start gap-3 py-2">
                        <dt className="w-[120px] shrink-0 text-slate-500">Presupuesto</dt>
                        <dd className="min-w-0 flex-1 text-right font-semibold text-slate-950 break-words">
                          {summary.budget}
                        </dd>
                      </div>
                      <div className="flex items-start gap-3 py-2">
                        <dt className="w-[120px] shrink-0 text-slate-500">Estilo</dt>
                        <dd className="min-w-0 flex-1 text-right font-semibold text-slate-950 break-words">
                          {summary.style}
                        </dd>
                      </div>
                      <div className="flex items-start gap-3 py-2">
                        <dt className="w-[120px] shrink-0 text-slate-500">Sitios</dt>
                        <dd className="min-w-0 flex-1 text-right font-semibold text-slate-950 break-words">
                          {summary.mustSee}
                        </dd>
                      </div>
                    </dl>
                  ) : (
                    <p className="mt-2 text-sm text-slate-600">
                      Aquí verás lo que el asistente virtual ha entendido cuando pulses <span className="font-semibold">Leer lo que he entendido</span>.
                    </p>
                  )}
                </div>

                <div className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4 text-xs text-slate-600">
                  <p className="font-semibold text-slate-900">Cómo funciona</p>
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

