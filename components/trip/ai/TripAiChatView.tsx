"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import TripScreenActions from "@/components/trip/common/TripScreenActions";
import TripBoardPageHeader from "@/components/layout/TripBoardPageHeader";

type ChatMode = "general" | "planning" | "expenses" | "optimizer" | "actions";

type Conversation = {
  id: string;
  title: string;
  mode: ChatMode;
  updated_at?: string;
};

type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata?: Record<string, unknown>;
};

type ItineraryPayload = {
  version: 1;
  title?: string;
  days: Array<{
    day: number;
    date: string | null;
    items: Array<{
      title: string;
      activity_kind?: string | null;
      place_name?: string | null;
      address?: string | null;
      start_time?: string | null;
      notes?: string | null;
    }>;
  }>;
};

type DiffOperation =
  | { op: "update_activity"; id: string; patch: Record<string, unknown> }
  | { op: "create_activity"; fields: Record<string, unknown> }
  | { op: "delete_activity"; id: string }
  | { op: "update_route"; id: string; patch: Record<string, unknown> };

type DiffPayload = {
  version: 1;
  title?: string;
  operations: DiffOperation[];
};

function extractItinerary(answer: string): ItineraryPayload | null {
  const start = "TRIPBOARD_ITINERARY_JSON_START";
  const end = "TRIPBOARD_ITINERARY_JSON_END";
  const iStart = answer.indexOf(start);
  const iEnd = answer.indexOf(end);
  if (iStart === -1 || iEnd === -1 || iEnd <= iStart) return null;
  const raw = answer.slice(iStart + start.length, iEnd).trim();
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.days)) return null;
    return parsed as ItineraryPayload;
  } catch {
    return null;
  }
}

function extractDiff(answer: string): DiffPayload | null {
  const start = "TRIPBOARD_DIFF_JSON_START";
  const end = "TRIPBOARD_DIFF_JSON_END";
  const iStart = answer.indexOf(start);
  const iEnd = answer.indexOf(end);
  if (iStart === -1 || iEnd === -1 || iEnd <= iStart) return null;
  const raw = answer.slice(iStart + start.length, iEnd).trim();
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.operations)) return null;
    return parsed as DiffPayload;
  } catch {
    return null;
  }
}

const MODE_OPTIONS: { id: ChatMode; label: string; description: string }[] = [
  { id: "general", label: "General", description: "Consultas generales del viaje" },
  { id: "planning", label: "Planificación", description: "Plan del viaje, días y visitas" },
  { id: "expenses", label: "Gastos", description: "Balances, pagos y ahorro" },
  { id: "optimizer", label: "Optimizador", description: "Mejoras automáticas del viaje" },
  { id: "actions", label: "Acciones", description: "Crear o modificar datos del viaje" },
];

const SUGGESTIONS: Record<ChatMode, string[]> = {
  general: [
    "Hazme un resumen del viaje",
    "¿Qué reservas tengo confirmadas?",
    "¿Qué documentos importantes tengo guardados?",
  ],
  planning: [
    "Dame un plan para 4 días",
    "¿Qué actividades tengo por día?",
    "Organiza un recorrido lógico con lo que ya tengo",
  ],
  expenses: [
    "¿Cuánto llevamos gastado?",
    "¿Quién debe dinero ahora mismo?",
    "¿Qué pagos siguen pendientes?",
  ],
  optimizer: [
    "Optimiza mi viaje y dime mejoras",
    "Detecta huecos y conflictos",
    "¿Qué cambiarías para aprovechar mejor el viaje?",
  ],
  actions: [
    "Añade actividad cena en Honfleur 2026-04-02",
    "Marca como pagado el siguiente balance pendiente",
    "Crea una actividad paseo por Caen 2026-04-03",
  ],
};

export default function TripAiChatView({
  tripId,
  isPremium = true,
}: {
  tripId: string;
  isPremium?: boolean;
}) {
  const [mode, setMode] = useState<ChatMode>("general");
  const [provider, setProvider] = useState<"auto" | "gemini" | "ollama">("auto");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hola. Soy tu asistente del viaje. Ya puedo recordar conversaciones, ayudarte con gastos, optimizar el viaje y ejecutar algunas acciones básicas dentro de la app.",
    },
  ]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [itineraryDraft, setItineraryDraft] = useState<ItineraryPayload | null>(null);
  const [diffDraft, setDiffDraft] = useState<DiffPayload | null>(null);
  const [applyingDiff, setApplyingDiff] = useState(false);
  const [diffContext, setDiffContext] = useState<{
    activitiesById: Map<string, any>;
    routesById: Map<string, any>;
  } | null>(null);
  const [diffContextLoading, setDiffContextLoading] = useState(false);
  const [diffAllowDeletes, setDiffAllowDeletes] = useState(false);
  const [diffSelected, setDiffSelected] = useState<Set<string>>(new Set());
  const [executingPlan, setExecutingPlan] = useState(false);
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadDiffContext() {
      if (!diffDraft) {
        setDiffContext(null);
        return;
      }
      setDiffContextLoading(true);
      try {
        const [aRes, rRes] = await Promise.all([
          fetch(`/api/trip-activities?tripId=${encodeURIComponent(tripId)}`, { cache: "no-store" }),
          fetch(`/api/trip-routes?tripId=${encodeURIComponent(tripId)}`, { cache: "no-store" }),
        ]);
        const [aPayload, rPayload] = await Promise.all([
          aRes.json().catch(() => null),
          rRes.json().catch(() => null),
        ]);
        const activities = Array.isArray(aPayload?.activities) ? aPayload.activities : [];
        const routes = Array.isArray(rPayload?.routes) ? rPayload.routes : [];
        const activitiesById = new Map<string, any>();
        const routesById = new Map<string, any>();
        for (const row of activities) if (row?.id) activitiesById.set(String(row.id), row);
        for (const row of routes) if (row?.id) routesById.set(String(row.id), row);
        if (!cancelled) setDiffContext({ activitiesById, routesById });
      } catch {
        if (!cancelled) setDiffContext(null);
      } finally {
        if (!cancelled) setDiffContextLoading(false);
      }
    }
    void loadDiffContext();
    return () => {
      cancelled = true;
    };
  }, [diffDraft, tripId]);

  useEffect(() => {
    // Selección por defecto: todo menos borrados
    if (!diffDraft) {
      setDiffSelected(new Set());
      setDiffAllowDeletes(false);
      return;
    }
    const next = new Set<string>();
    (diffDraft.operations || []).forEach((op: any, idx: number) => {
      const key = opKey(op, idx);
      const rawOp = typeof op?.op === "string" ? op.op.toLowerCase() : "";
      if (rawOp.startsWith("delete_")) return;
      next.add(key);
    });
    setDiffSelected(next);
    setDiffAllowDeletes(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diffDraft]);

  function opKey(op: any, idx: number) {
    return `${String(op?.op || "op")}-${String(op?.id || op?.fields?.title || idx)}`;
  }

  function opDisplay(op: any): {
    kind: "activity" | "route" | "unknown";
    title: string;
    subtitle: string | null;
    date: string | null;
    tone: "good" | "warn" | "neutral";
    details: string | null;
    raw: any;
  } {
    const rawOp = typeof op?.op === "string" ? op.op.trim() : "";
    const normalized = rawOp.toLowerCase();
    const id = typeof op?.id === "string" ? op.id : null;

    const act = id && diffContext?.activitiesById ? diffContext.activitiesById.get(id) : null;
    const route = id && diffContext?.routesById ? diffContext.routesById.get(id) : null;

    if (normalized === "update_activity") {
      const patch = op?.patch || {};
      const beforeTitle = String(act?.title || "").trim() || "Plan";
      const nextTitle = typeof patch.title === "string" && patch.title.trim() ? patch.title.trim() : beforeTitle;
      const beforeDate = typeof act?.activity_date === "string" ? act.activity_date : null;
      const afterDate = typeof patch.activity_date === "string" ? patch.activity_date : patch.activity_date === null ? null : beforeDate;
      const beforeTime = typeof act?.activity_time === "string" ? act.activity_time : null;
      const afterTime = typeof patch.activity_time === "string" ? patch.activity_time : patch.activity_time === null ? null : beforeTime;

      const changes: string[] = [];
      if (nextTitle !== beforeTitle) changes.push(`Título: “${beforeTitle}” → “${nextTitle}”`);
      if (afterDate !== beforeDate) changes.push(`Fecha: ${beforeDate || "—"} → ${afterDate || "—"}`);
      if (afterTime !== beforeTime) changes.push(`Hora: ${beforeTime || "—"} → ${afterTime || "—"}`);
      if (typeof patch.address === "string") changes.push("Dirección actualizada");
      if (typeof patch.place_name === "string") changes.push("Lugar actualizado");
      if (typeof patch.activity_kind === "string") changes.push("Tipo actualizado");

      return {
        kind: "activity",
        title: `Actualizar plan: ${nextTitle}`,
        subtitle: changes.length ? changes.join(" · ") : "Cambio menor",
        date: afterDate || beforeDate,
        tone: "neutral",
        details: null,
        raw: op,
      };
    }

    if (normalized === "create_activity") {
      const f = op?.fields || {};
      const title = String(f?.title || "").trim() || "Nuevo plan";
      const date = typeof f?.activity_date === "string" ? f.activity_date : null;
      const time = typeof f?.activity_time === "string" ? f.activity_time : null;
      const where = String(f?.place_name || f?.address || "").trim();
      return {
        kind: "activity",
        title: `Añadir plan: ${title}`,
        subtitle: [date, time, where].filter(Boolean).join(" · ") || null,
        date,
        tone: "good",
        details: null,
        raw: op,
      };
    }

    if (normalized === "delete_activity") {
      const title = String(act?.title || "").trim() || "Plan";
      const date = typeof act?.activity_date === "string" ? act.activity_date : null;
      return {
        kind: "activity",
        title: `Eliminar plan: ${title}`,
        subtitle: date ? `Fecha: ${date}` : null,
        date,
        tone: "warn",
        details: "Revisa bien los borrados antes de aplicar.",
        raw: op,
      };
    }

    if (normalized === "update_route") {
      const patch = op?.patch || {};
      const beforeTitle = String(route?.title || route?.route_name || route?.name || "").trim() || "Ruta";
      const nextTitle =
        typeof patch.title === "string" && patch.title.trim() ? patch.title.trim() : beforeTitle;
      const beforeDay = typeof route?.route_day === "string" ? route.route_day : null;
      const afterDay =
        typeof patch.route_day === "string" ? patch.route_day : patch.route_day === null ? null : beforeDay;
      const beforeTime = typeof route?.departure_time === "string" ? route.departure_time : null;
      const afterTime =
        typeof patch.departure_time === "string"
          ? patch.departure_time
          : patch.departure_time === null
            ? null
            : beforeTime;

      const changes: string[] = [];
      if (nextTitle !== beforeTitle) changes.push(`Título: “${beforeTitle}” → “${nextTitle}”`);
      if (afterDay !== beforeDay) changes.push(`Día: ${beforeDay || "—"} → ${afterDay || "—"}`);
      if (afterTime !== beforeTime) changes.push(`Salida: ${beforeTime || "—"} → ${afterTime || "—"}`);
      if (typeof patch.travel_mode === "string") changes.push(`Modo: ${patch.travel_mode}`);
      if (typeof patch.notes === "string") changes.push("Notas actualizadas");

      return {
        kind: "route",
        title: `Actualizar ruta: ${nextTitle}`,
        subtitle: changes.length ? changes.join(" · ") : null,
        date: afterDay || beforeDay,
        tone: "neutral",
        details: null,
        raw: op,
      };
    }

    // Si la IA se sale del formato
    return {
      kind: "unknown",
      title: `Operación no reconocida: ${rawOp || "unknown"}`,
      subtitle: null,
      date: null,
      tone: "warn",
      details: "La IA devolvió un formato distinto al esperado. Puedes descartarlo.",
      raw: op,
    };
  }

  const currentSuggestions = useMemo(() => SUGGESTIONS[mode], [mode]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("trip_ai_provider");
      if (stored === "gemini" || stored === "ollama" || stored === "auto") setProvider(stored);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("trip_ai_provider", provider);
    } catch {
      // ignore
    }
  }, [provider]);

  useEffect(() => {
    if (isPremium) void loadConversations();
  }, [tripId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function loadConversations() {
    const res = await fetch(`/api/trip-ai/conversations?tripId=${encodeURIComponent(tripId)}`);
    const data = await res.json().catch(() => null);
    if (res.ok) {
      setConversations(Array.isArray(data?.conversations) ? data.conversations : []);
    }
  }

  async function openConversation(id: string) {
    if (!isPremium) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/trip-ai/${encodeURIComponent(id)}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "No se pudo abrir la conversación.");
      setConversationId(id);
      setMessages(data?.messages?.length ? data.messages : []);
      if (data?.conversation?.mode) setMode(data.conversation.mode);
      setInfo(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo abrir la conversación.");
    } finally {
      setLoading(false);
    }
  }

  function newConversation() {
    setConversationId(null);
    setMessages([
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          "Nueva conversación iniciada. Pregúntame lo que necesites sobre tu viaje.",
      },
    ]);
    setQuestion("");
    setInfo(null);
    setError(null);
  }

  async function sendMessage(customQuestion?: string) {
    if (!isPremium) return;
    const clean = (customQuestion ?? question).trim();
    if (!clean || loading) return;

    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", content: clean },
    ]);
    setQuestion("");
    setLoading(true);
    setError(null);
    setInfo(null);

    try {
      const res = await fetch("/api/trip-ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId,
          question: clean,
          mode,
          conversationId,
          provider: provider === "auto" ? null : provider,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "No se pudo obtener respuesta.");

      setConversationId(data?.conversationId || conversationId);
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data?.answer || "No se pudo generar respuesta",
        },
      ]);

      const maybe = typeof data?.answer === "string" ? extractItinerary(data.answer) : null;
      if (maybe) setItineraryDraft(maybe);
      if (maybe) setExpandedDay(null);

      const maybeDiff = typeof data?.answer === "string" ? extractDiff(data.answer) : null;
      if (maybeDiff) setDiffDraft(maybeDiff);

      if (data?.actionExecuted && data?.actionResult) {
        setInfo(String(data.actionResult));
      }

      await loadConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo obtener respuesta.");
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "He tenido un problema al responder. Revisa la configuración del chat IA.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    void sendMessage();
  }

  return (
    <main className="space-y-6">
      <TripBoardPageHeader
        section="Asistente IA del viaje"
        title="Chat, memoria, acciones y optimización"
        description="Recuerda conversaciones, ayuda con gastos, optimiza el viaje y ejecuta acciones básicas dentro de la app."
        actions={<TripScreenActions tripId={tripId} />}
      />

      {!isPremium ? (
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-amber-200 px-2 py-1 text-[11px] font-extrabold uppercase tracking-[0.16em] text-amber-950">
              Aviso
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-amber-950">
                Chat IA deshabilitado para la versión gratuita, mejora a la versión premium para tener todas las funcionalidades.
              </div>
              <div className="mt-1 text-sm text-amber-900/80">
                Puedes seguir navegando por esta pantalla, pero el envío de mensajes y las acciones automáticas están desactivadas.
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {itineraryDraft ? (
        <section className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-sky-50 p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="text-xs font-extrabold uppercase tracking-[0.16em] text-violet-700">Itinerario propuesto</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">
                {itineraryDraft.title || `${itineraryDraft.days.length} días`}
              </div>
              <div className="mt-1 text-xs text-slate-600">
                Revisa en el chat y, cuando estés conforme, ejecútalo para añadirlo al Plan.
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {itineraryDraft.days.slice(0, 6).map((d) => (
                  <button
                    key={d.day}
                    type="button"
                    onClick={() => setExpandedDay((prev) => (prev === d.day ? null : d.day))}
                    className={`rounded-xl border px-3 py-2 text-left text-xs transition ${
                      expandedDay === d.day
                        ? "border-violet-300 bg-violet-50"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                    }`}
                  >
                    <div className="font-extrabold text-slate-900">Día {d.day}{d.date ? ` · ${d.date}` : ""}</div>
                    <div className="mt-0.5 text-slate-600">{d.items.length} paradas</div>
                  </button>
                ))}
              </div>

              {expandedDay ? (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">
                        Detalle del día
                      </div>
                      {(() => {
                        const d = itineraryDraft.days.find((x) => x.day === expandedDay);
                        return (
                          <div className="mt-1 text-sm font-semibold text-slate-900">
                            Día {expandedDay}{d?.date ? ` · ${d.date}` : ""}
                          </div>
                        );
                      })()}
                    </div>
                    <button
                      type="button"
                      onClick={() => setExpandedDay(null)}
                      className="shrink-0 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                    >
                      Cerrar
                    </button>
                  </div>

                  <div className="mt-3 space-y-2">
                    {(() => {
                      const d = itineraryDraft.days.find((x) => x.day === expandedDay);
                      const items = d?.items || [];
                      return items.length ? (
                        items.map((it, idx) => (
                          <div key={`${it.title}-${idx}`} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-xs font-extrabold text-slate-900">
                                  {it.start_time ? `${it.start_time} · ` : ""}{it.title}
                                </div>
                                <div className="mt-0.5 text-[11px] text-slate-600">
                                  {it.place_name || it.address || it.activity_kind || "Parada"}
                                </div>
                              </div>
                              {it.activity_kind ? (
                                <div className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">
                                  {it.activity_kind}
                                </div>
                              ) : null}
                            </div>
                            {it.notes ? (
                              <div className="mt-2 text-[11px] text-slate-600">
                                {it.notes}
                              </div>
                            ) : null}
                          </div>
                        ))
                      ) : (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-white px-3 py-3 text-xs text-slate-600">
                          No hay items para este día.
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex shrink-0 flex-col gap-2">
              <button
                type="button"
                disabled={executingPlan || loading}
                onClick={async () => {
                  setExecutingPlan(true);
                  setInfo(null);
                  setError(null);
                  try {
                    const res = await fetch("/api/trip-ai/execute-plan", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ tripId, itinerary: itineraryDraft }),
                    });
                    const payload = await res.json().catch(() => null);
                    if (!res.ok) throw new Error(payload?.error || "No se pudo ejecutar el plan.");
                    setInfo(`Plan ejecutado. He creado ${payload?.created ?? "varias"} actividades en el Plan.`);
                    setItineraryDraft(null);
                    setExpandedDay(null);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "No se pudo ejecutar el plan.");
                  } finally {
                    setExecutingPlan(false);
                  }
                }}
                className="inline-flex items-center justify-center rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
              >
                {executingPlan ? "Ejecutando..." : "Ejecutar plan"}
              </button>
              <button
                type="button"
                onClick={() => setItineraryDraft(null)}
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Descartar
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {diffDraft ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-950">Cambios propuestos por la IA</div>
              <div className="mt-1 text-xs text-slate-600">
                Revisa el “diff” antes de aplicar. Está agrupado por día y muestra antes → después cuando es posible.
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setDiffDraft(null)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Descartar
              </button>
              <button
                type="button"
                disabled={applyingDiff || diffSelected.size === 0}
                onClick={async () => {
                  setApplyingDiff(true);
                  setError(null);
                  try {
                    const filtered = (diffDraft.operations || []).filter((op: any, idx: number) =>
                      diffSelected.has(opKey(op, idx))
                    );
                    const res = await fetch("/api/trip-ai/apply-diff", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ tripId, diff: { ...diffDraft, operations: filtered } }),
                    });
                    const payload = await res.json().catch(() => null);
                    if (!res.ok) throw new Error(payload?.error || "No se pudo aplicar el diff.");
                    if (payload?.results?.some?.((r: any) => !r.ok)) {
                      throw new Error("Se aplicaron algunos cambios, pero otros fallaron. Revisa el historial o vuelve a intentar.");
                    }
                    setInfo("Cambios aplicados.");
                    setDiffDraft(null);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "No se pudo aplicar el diff.");
                  } finally {
                    setApplyingDiff(false);
                  }
                }}
                className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {applyingDiff ? "Aplicando..." : "Aplicar cambios"}
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs text-slate-600">
              Seleccionados: <span className="font-semibold text-slate-900">{diffSelected.size}</span> /{" "}
              <span className="font-semibold text-slate-900">{diffDraft.operations?.length || 0}</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={diffAllowDeletes}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setDiffAllowDeletes(checked);
                    if (!checked) {
                      // al desactivar, deseleccionamos cualquier delete_*
                      const next = new Set(diffSelected);
                      (diffDraft.operations || []).forEach((op: any, idx: number) => {
                        const rawOp = typeof op?.op === "string" ? op.op.toLowerCase() : "";
                        if (rawOp.startsWith("delete_")) next.delete(opKey(op, idx));
                      });
                      setDiffSelected(next);
                    }
                  }}
                />
                Permitir borrados
              </label>
              <button
                type="button"
                onClick={() => {
                  const next = new Set<string>();
                  (diffDraft.operations || []).forEach((op: any, idx: number) => {
                    const rawOp = typeof op?.op === "string" ? op.op.toLowerCase() : "";
                    if (rawOp.startsWith("delete_") && !diffAllowDeletes) return;
                    next.add(opKey(op, idx));
                  });
                  setDiffSelected(next);
                }}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Seleccionar todo
              </button>
              <button
                type="button"
                onClick={() => setDiffSelected(new Set())}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Deseleccionar todo
              </button>
            </div>
          </div>

          {diffContextLoading ? (
            <div className="mt-4 text-sm text-slate-600">Preparando preview…</div>
          ) : (
            <div className="mt-4 space-y-3">
              {(() => {
                const ops = (diffDraft.operations || [])
                  .slice(0, 80)
                  .map((op, idx) => ({ ...opDisplay(op), __key: opKey(op, idx), __rawOp: op, __idx: idx }));
                const byDate = new Map<string, ReturnType<typeof opDisplay>[]>();
                for (const item of ops) {
                  const key = item.date || "Sin fecha";
                  const arr = byDate.get(key) || [];
                  arr.push(item);
                  byDate.set(key, arr);
                }
                const dates = Array.from(byDate.keys()).sort((a, b) => a.localeCompare(b));
                return (
                  <>
                    {dates.map((d) => (
                      <div key={d} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-slate-950">{d}</div>
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                            {byDate.get(d)?.length || 0} cambios
                          </span>
                        </div>
                        <div className="mt-3 space-y-2">
                          {(byDate.get(d) || []).map((it, idx) => {
                            const tone =
                              it.tone === "good"
                                ? "border-emerald-200 bg-white"
                                : it.tone === "warn"
                                  ? "border-rose-200 bg-white"
                                  : "border-slate-200 bg-white";
                            const badge =
                              it.tone === "good"
                                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                : it.tone === "warn"
                                  ? "bg-rose-50 text-rose-800 border-rose-200"
                                  : "bg-slate-50 text-slate-700 border-slate-200";
                            const badgeText = it.tone === "good" ? "Añade" : it.tone === "warn" ? "Borra" : "Cambia";
                            const rawOp = (it as any).__rawOp;
                            const rawOpName = typeof rawOp?.op === "string" ? rawOp.op.toLowerCase() : "";
                            const isDelete = rawOpName.startsWith("delete_");
                            const key = (it as any).__key as string;
                            const selected = diffSelected.has(key);
                            const disabled = isDelete && !diffAllowDeletes;
                            return (
                              <details
                                key={`${it.title}-${idx}`}
                                className={`rounded-xl border ${tone} p-3 ${disabled ? "opacity-60" : ""}`}
                              >
                                <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-2">
                                  <div className="flex min-w-0 items-start gap-2">
                                    <input
                                      type="checkbox"
                                      checked={selected}
                                      disabled={disabled}
                                      onChange={(e) => {
                                        const checked = e.target.checked;
                                        setDiffSelected((prev) => {
                                          const next = new Set(prev);
                                          if (checked) next.add(key);
                                          else next.delete(key);
                                          return next;
                                        });
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      className="mt-1"
                                      title={
                                        disabled
                                          ? "Activa “Permitir borrados” para seleccionar esto."
                                          : "Aplicar este cambio"
                                      }
                                    />
                                    <div className="min-w-0">
                                      <div className="text-sm font-semibold text-slate-950">{it.title}</div>
                                      {it.subtitle ? (
                                        <div className="mt-1 text-xs text-slate-600">{it.subtitle}</div>
                                      ) : null}
                                      {it.details ? (
                                        <div className="mt-1 text-xs text-rose-700">{it.details}</div>
                                      ) : null}
                                    </div>
                                  </div>

                                  <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${badge}`}>
                                    {badgeText}
                                  </span>
                                </summary>
                                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                                  <div className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-slate-500">
                                    Detalle técnico (JSON)
                                  </div>
                                  <pre className="mt-2 whitespace-pre-wrap text-xs text-slate-700">
{JSON.stringify(it.raw, null, 2)}
                                  </pre>
                                </div>
                              </details>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    {(diffDraft.operations || []).length > 80 ? (
                      <div className="text-xs text-slate-500">… y más cambios (truncado).</div>
                    ) : null}
                  </>
                );
              })()}
            </div>
          )}
        </section>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-6">
          <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-slate-950">Conversaciones</h2>
              <button
                type="button"
                onClick={newConversation}
                disabled={!isPremium}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
              >
                Nueva
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {conversations.length ? conversations.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void openConversation(item.id)}
                  disabled={!isPremium}
                  className={`w-full rounded-2xl border px-3 py-3 text-left text-sm transition ${
                    conversationId === item.id
                      ? "border-violet-300 bg-violet-50 text-violet-900"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <div className="font-semibold">{item.title || "Sin título"}</div>
                  <div className="mt-1 text-xs opacity-70">{item.mode}</div>
                </button>
              )) : (
                <p className="text-sm text-slate-500">Todavía no hay conversaciones guardadas.</p>
              )}
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">Modos IA</h2>
            <div className="mt-4 space-y-2">
              {MODE_OPTIONS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setMode(item.id)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                    mode === item.id
                      ? "border-violet-300 bg-violet-50"
                      : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                  }`}
                >
                  <div className="font-semibold text-slate-900">{item.label}</div>
                  <div className="mt-1 text-xs text-slate-500">{item.description}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">Proveedor</h2>
            <p className="mt-2 text-xs text-slate-600">
              Auto usa lo configurado en el servidor. Puedes forzar Gemini u Ollama para probar.
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                { id: "auto" as const, label: "Auto" },
                { id: "gemini" as const, label: "Gemini" },
                { id: "ollama" as const, label: "Ollama" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setProvider(opt.id)}
                  className={`rounded-2xl border px-3 py-2 text-xs font-semibold transition ${
                    provider === opt.id
                      ? "border-violet-300 bg-violet-50 text-violet-900"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">Preguntas rápidas</h2>
            <div className="mt-4 space-y-2">
              {currentSuggestions.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => void sendMessage(item)}
                  disabled={loading || !isPremium}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Conversación</h2>
                <p className="mt-1 text-sm text-slate-500">
                  El asistente usa el contexto guardado del viaje y recuerda esta conversación.
                </p>
              </div>

              <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {loading ? "Pensando..." : "Listo"}
              </div>
            </div>
          </div>

          {error ? (
            <div className="mx-5 mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {info ? (
            <div className="mx-5 mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {info}
            </div>
          ) : null}

          <div className="max-h-[560px] space-y-5 overflow-y-auto px-5 py-5">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[88%] rounded-[24px] px-4 py-3 text-sm leading-7 ${
                    message.role === "user"
                      ? "bg-slate-950 text-white"
                      : "border border-slate-200 bg-slate-50 text-slate-800"
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))}

            {loading ? (
              <div className="flex justify-start">
                <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                  Generando respuesta…
                </div>
              </div>
            ) : null}

            <div ref={bottomRef} />
          </div>

          <form onSubmit={handleSubmit} className="border-t border-slate-200 p-5">
            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-3">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                rows={4}
                placeholder="Escribe tu pregunta o acción sobre el viaje…"
                disabled={!isPremium}
                className="min-h-[120px] w-full resize-none rounded-2xl border-0 bg-transparent px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400"
              />

              <div className="flex flex-col gap-3 border-t border-slate-200 px-2 pt-3 md:flex-row md:items-center md:justify-between">
                <p className="text-xs text-slate-500">
                  Modo activo: {MODE_OPTIONS.find((m) => m.id === mode)?.label}.
                </p>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setQuestion("")}
                    disabled={loading || !question || !isPremium}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
                  >
                    Limpiar
                  </button>

                  <button
                    type="submit"
                    disabled={loading || !question.trim() || !isPremium}
                    className="rounded-xl bg-slate-950 px-5 py-2 text-sm font-semibold text-white disabled:bg-slate-300"
                  >
                    Enviar
                  </button>
                </div>
              </div>
            </div>
          </form>
        </section>
      </section>
    </main>
  );
}
