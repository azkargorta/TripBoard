"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TripScreenActions from "@/components/trip/common/TripScreenActions";
import TripBoardPageHeader from "@/components/layout/TripBoardPageHeader";
import Link from "next/link";
import { useTripData } from "@/hooks/useTripData";
import { useTripAiOnboarding, type OnboardingDraft } from "@/components/trip/ai/useTripAiOnboarding";
import type { AIActionId } from "@/lib/trip-ai/aiActions";

type ChatMode = "general" | "planning" | "expenses" | "optimizer" | "actions";
type ExtendedChatMode = ChatMode | "day_planner";

type Conversation = {
  id: string;
  title: string;
  mode: ExtendedChatMode;
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
  /** Opcional: cómo calcular rutas entre paradas (driving | walking | cycling). */
  travelMode?: "driving" | "walking" | "cycling";
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

type ModeGroupId = "talk" | "write";

type ModeOption = {
  id: ExtendedChatMode;
  label: string;
  /** Una línea: para qué sirve este modo */
  description: string;
  /** Cuándo elegirlo (texto orientativo) */
  useFor: string;
  group: ModeGroupId;
};

const MODE_GROUPS: { id: ModeGroupId; title: string; hint: string }[] = [
  {
    id: "talk",
    title: "Preguntar y analizar",
    hint: "La IA responde y usa el contexto del viaje; no cambia datos hasta que tú apliques un plan o un diff.",
  },
  {
    id: "write",
    title: "Preparar o guardar en la app",
    hint: "Aquí la IA puede proponer cambios concretos (actividades, rutas…) para que los revises y apliques.",
  },
];

const MODE_OPTIONS: ModeOption[] = [
  {
    id: "general",
    label: "General",
    description: "Dudas amplias sobre el viaje",
    useFor: "Resúmenes, qué tienes guardado, recomendaciones generales.",
    group: "talk",
  },
  {
    id: "planning",
    label: "Planificación",
    description: "Itinerarios por varios días",
    useFor: "Varios días, orden de visitas, propuestas de agenda (itinerario en JSON + «Ejecutar plan»).",
    group: "talk",
  },
  {
    id: "expenses",
    label: "Gastos",
    description: "Balances y reparto",
    useFor: "Cuánto se ha gastado, quién debe a quién, ideas para pagar.",
    group: "talk",
  },
  {
    id: "optimizer",
    label: "Optimizador",
    description: "Mejorar el viaje",
    useFor: "Detectar huecos, solapes o formas de aprovechar mejor el plan.",
    group: "talk",
  },
  {
    id: "actions",
    label: "Acciones",
    description: "Cambios puntuales en datos",
    useFor: "Pedir a la IA que cree o modifique actividades/rutas vía «diff» revisable.",
    group: "write",
  },
  {
    id: "day_planner",
    label: "Organizar día",
    description: "Un día completo con rutas",
    useFor: "Un solo día: horarios, comidas, desplazamientos; guardas con «Aplicar cambios» (no «Ejecutar plan»).",
    group: "write",
  },
];

const MODE_LABELS: Record<ExtendedChatMode, string> = {
  general: "General",
  planning: "Planificación",
  expenses: "Gastos",
  optimizer: "Optimizador",
  actions: "Acciones",
  day_planner: "Organizar día",
};

const PLACEHOLDERS: Record<ExtendedChatMode, string> = {
  general: "Ej.: hazme un resumen del viaje o qué documentos conviene llevar…",
  planning: "Ej.: dame un plan de 3 días en Roma o reorganiza mis visitas…",
  expenses: "Ej.: ¿cuánto llevamos gastado? ¿quién debe a quién?…",
  optimizer: "Ej.: detecta huecos en mi plan o sugiere mejoras…",
  actions: "Ej.: añade una cena el viernes en el plan o crea una ruta entre dos puntos…",
  day_planner:
    "Ej.: organízame el 2026-06-15 en Ámsterdam, andando, de 10:00 a 21:00… (luego «Aplicar cambios» para guardar)",
};

const SMART_CHIPS: Array<{ label: string; prompt: string; action: AIActionId }> = [
  { label: "✨ Optimizar viaje", prompt: "Optimiza el viaje: detecta huecos, solapes y mejoras prácticas.", action: "optimize_route" },
  { label: "🗺️ Mejorar rutas", prompt: "Mejora el orden geográfico y las rutas entre paradas para desperdiciar menos tiempo.", action: "optimize_route" },
  { label: "💸 Ajustar presupuesto", prompt: "Ayúdame a revisar el presupuesto y el reparto de gastos con lo que ya tenemos.", action: "adjust_budget" },
  { label: "🍽️ Añadir restaurantes", prompt: "Sugiere restaurantes que encajen y, si aplica, añade actividades tipo restaurante al plan.", action: "add_activity" },
];

const SUGGESTIONS: Record<ExtendedChatMode, string[]> = {
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
  day_planner: [
    "Organízame el día 2026-04-02 en París. Vamos andando. Queremos 2 museos y un mirador.",
    "Hazme un día completo mañana. Ritmo tranquilo, comida informal y cena reservable. En coche.",
    "Quiero visitar lo imprescindible en un día y que me lo guardes con rutas.",
  ],
};

export default function TripAiChatView({
  tripId,
  isPremium = true,
}: {
  tripId: string;
  isPremium?: boolean;
}) {
  if (!isPremium) {
    return (
      <main className="space-y-6">
        <TripBoardPageHeader
          section="Asistente IA del viaje"
          title="Chat IA"
          description="Esta página está reservada a usuarios Premium."
          iconSrc="/brand/tabs/ai.png"
          iconAlt="Chat IA"
          actions={<TripScreenActions tripId={tripId} />}
        />

        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6">
          <div className="text-sm font-semibold text-amber-950">
            Esta página está reservada a usuarios premium.
          </div>
          <div className="mt-2 text-sm text-amber-900/80">
            Mejora a Premium para habilitar chat, memoria, acciones y optimización del viaje.
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/account?upgrade=premium&focus=premium#premium-plans"
              className="inline-flex min-h-[44px] items-center justify-center rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Mejorar a Premium
            </Link>
            <Link
              href={`/trip/${encodeURIComponent(tripId)}`}
              className="inline-flex min-h-[44px] items-center justify-center rounded-2xl border border-amber-200 bg-white px-4 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-50"
            >
              Volver al viaje
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const [mode, setMode] = useState<ExtendedChatMode>("general");
  const [provider, setProvider] = useState<"auto" | "gemini" | "ollama">("auto");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Te ayudo con tu viaje ✈️\n\n" +
        "Escribe abajo con libertad: optimizar rutas, gastos, ideas… Si el plan está vacío, te propondré una guía breve para arrancar.\n\n" +
        "Cuando la IA devuelva un itinerario o cambios, revísalos y usa «Ejecutar plan» o «Aplicar cambios» para guardarlos en el mapa y el plan.",
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
  /** Panel «Tipo de chat» (y pastillas en móvil): cerrado por defecto */
  const [chatTypesOpen, setChatTypesOpen] = useState(false);
  const [modeSource, setModeSource] = useState<"auto" | "manual">("auto");
  const [planActivityCount, setPlanActivityCount] = useState<number | null>(null);
  const [onboardingBusy, setOnboardingBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const { trip, reload: reloadTrip, loading: tripDataLoading } = useTripData(tripId);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/trip-activities?tripId=${encodeURIComponent(tripId)}`, { cache: "no-store" });
        const data = await res.json().catch(() => null);
        const n = Array.isArray(data?.activities) ? data.activities.length : 0;
        if (!cancelled) setPlanActivityCount(n);
      } catch {
        if (!cancelled) setPlanActivityCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  const {
    onboardingActive,
    onboardingStep,
    setOnboardingStep,
    onboardingDraft,
    setOnboardingDraft,
    skipOnboarding,
    markOnboardingComplete,
    applyDurationChips,
  } = useTripAiOnboarding({
    tripId,
    tripLoaded: !tripDataLoading && planActivityCount !== null && Boolean(trip),
    planActivityCount,
  });

  const patchTripMeta = useCallback(
    async (payload: Record<string, unknown>) => {
      const res = await fetch(`/api/trips/${encodeURIComponent(tripId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "No se pudo actualizar el viaje.");
      await reloadTrip();
    },
    [tripId, reloadTrip]
  );

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

  const placeholder = useMemo(() => PLACEHOLDERS[mode], [mode]);

  const inputPlaceholder = useMemo(() => {
    if (onboardingActive && onboardingStep === 1) return "Escribe un destino (ciudad, región, país)…";
    if (onboardingActive && onboardingStep === 2) {
      return "Opcional: escribe fechas o matices (“del 3 al 9 de agosto”, “Semana Santa”)…";
    }
    return placeholder;
  }, [onboardingActive, onboardingStep, placeholder]);

  useEffect(() => {
    if (!onboardingActive || onboardingStep !== 1) return;
    const t = trip?.destination?.trim();
    if (!t) return;
    setOnboardingDraft((d) => (d.destination ? d : { ...d, destination: t }));
  }, [onboardingActive, onboardingStep, trip?.destination, setOnboardingDraft]);

  const activeMode = useMemo(() => MODE_OPTIONS.find((m) => m.id === mode), [mode]);

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
    setModeSource("auto");
    setMessages([
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          "Nueva conversación. Escribe con libertad o usa las sugerencias de abajo; en modo automático la IA detecta la intención.",
      },
    ]);
    setQuestion("");
    setInfo(null);
    setError(null);
  }

  async function sendMessage(
    customQuestion?: string,
    forcedAiAction?: AIActionId | null,
    hooks?: { onSuccess?: () => void }
  ) {
    if (!isPremium) return;
    const clean = (customQuestion ?? question).trim();
    if (!clean || loading) return;

    const priorForHint = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .filter((m) => m.id !== "welcome")
      .slice(-4);
    const dialogHint =
      [
        ...priorForHint.map((m) => `${m.role === "user" ? "Usuario" : "Asistente"}: ${m.content.slice(0, 420)}`),
        `Usuario: ${clean.slice(0, 420)}`,
      ]
        .join("\n")
        .slice(0, 900) || "";

    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content: clean }]);
    setQuestion("");
    setLoading(true);
    setError(null);
    setInfo(null);

    try {
      const endpoint = mode === "day_planner" ? "/api/trip-ai/organize-day" : "/api/trip-ai/chat";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "day_planner"
            ? {
                tripId,
                question: clean,
                provider: provider === "auto" ? null : provider,
                conversation: [
                  ...messages
                    .filter((m) => m.role === "user" || m.role === "assistant")
                    .filter((m) => m.id !== "welcome")
                    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
                  { role: "user" as const, content: clean },
                ].slice(-8),
              }
            : {
                tripId,
                question: clean,
                mode: modeSource === "manual" ? mode : "general",
                modeSource,
                conversationId,
                provider: provider === "auto" ? null : provider,
                dialogHint,
                ...(forcedAiAction ? { aiAction: forcedAiAction } : {}),
              }
        ),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "No se pudo obtener respuesta.");

      if (mode !== "day_planner") {
        setConversationId(data?.conversationId || conversationId);
      }
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data?.answer || "No se pudo generar respuesta",
        },
      ]);

      const hasDayPlannerDiff =
        mode === "day_planner" &&
        data?.diff &&
        (data.diff as { version?: number }).version === 1 &&
        Array.isArray((data.diff as { operations?: unknown }).operations);

      if (hasDayPlannerDiff) {
        setItineraryDraft(null);
        setExpandedDay(null);
        setDiffDraft(data.diff as DiffPayload);
      } else {
        const maybe = typeof data?.answer === "string" ? extractItinerary(data.answer) : null;
        if (maybe) setItineraryDraft(maybe);
        if (maybe) setExpandedDay(null);

        const maybeDiff = typeof data?.answer === "string" ? extractDiff(data.answer) : null;
        if (maybeDiff) setDiffDraft(maybeDiff);
      }

      if (data?.actionExecuted && data?.actionResult) {
        setInfo(String(data.actionResult));
      }

      if (mode === "day_planner" && typeof data?.dayPlannerHint === "string" && data.dayPlannerHint) {
        setInfo(String(data.dayPlannerHint));
      }

      await loadConversations();
      hooks?.onSuccess?.();
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

  async function finalizeOnboardingWithAi(override?: Partial<OnboardingDraft>) {
    if (!isPremium || onboardingBusy) return;
    const merged = { ...onboardingDraft, ...override };
    setOnboardingDraft(merged);
    setOnboardingBusy(true);
    setError(null);
    try {
      const dest = (merged.destination || trip?.destination || "").trim();
      if (!dest) {
        setError("Indica un destino (o elige una sugerencia) para generar el plan.");
        return;
      }
      await patchTripMeta({
        destination: dest || null,
        start_date: merged.startDate || trip?.start_date || null,
        end_date: merged.endDate || trip?.end_date || null,
      });

      const datePart =
        merged.startDate && merged.endDate
          ? `Fechas: ${merged.startDate} → ${merged.endDate}.`
          : merged.dateNotes
            ? `Fechas (texto del usuario): ${merged.dateNotes}.`
            : "Fechas: propón un calendario coherente si faltan datos exactos.";

      const prompt = [
        `Genera un itinerario completo (varios días) para este viaje y devuelve el bloque JSON según el modo planificación.`,
        `Destino principal: ${dest}.`,
        datePart,
        merged.partySize ? `Personas aprox.: ${merged.partySize}.` : "",
        merged.tripStyle ? `Tipo de viaje: ${merged.tripStyle}.` : "",
        `Incluye 3–6 paradas por día cuando tenga sentido, con ritmo equilibrado.`,
      ]
        .filter(Boolean)
        .join(" ");

      await sendMessage(prompt, "generate_trip", {
        onSuccess: () => {
          markOnboardingComplete();
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar la guía inicial.");
    } finally {
      setOnboardingBusy(false);
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const clean = question.trim();
    if (!clean || loading) return;

    if (onboardingActive) {
      if (onboardingStep === 1) {
        setOnboardingDraft((d) => ({ ...d, destination: clean }));
        setOnboardingStep(2);
        setQuestion("");
        return;
      }
      if (onboardingStep === 2) {
        setOnboardingDraft((d) => ({ ...d, dateNotes: clean }));
        setOnboardingStep(3);
        setQuestion("");
        return;
      }
    }

    void sendMessage();
  }

  return (
    <main className="space-y-6">
      <TripBoardPageHeader
        section="Asistente IA del viaje"
        title="Chat IA"
        description="Chat libre con sugerencias y guía opcional al crear el plan. La IA usa un resumen del viaje y acciones concretas (no todo el historial) para ahorrar tokens."
        iconSrc="/brand/tabs/ai.png"
        iconAlt="Chat IA"
        actions={<TripScreenActions tripId={tripId} />}
      />

      {onboardingActive ? (
        <section className="rounded-[28px] border border-sky-200 bg-gradient-to-br from-sky-50 via-white to-violet-50 p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-sky-800">Guía inicial</p>
              <h2 className="mt-1 text-lg font-bold text-slate-950">Te ayudo a crear tu viaje paso a paso ✈️</h2>
              <p className="mt-2 text-sm text-slate-600">
                Responde con los botones o escribe abajo cuando quieras. Nada es obligatorio: puedes saltar la guía en cualquier momento.
              </p>
            </div>
            <button
              type="button"
              onClick={() => skipOnboarding()}
              className="shrink-0 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Saltar guía
            </button>
          </div>

          <div className="mt-5 space-y-4">
            {onboardingStep === 0 ? (
              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-800">¿Empezamos con unas preguntas rápidas?</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setOnboardingStep(1)}
                    className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    Empezar
                  </button>
                </div>
              </div>
            ) : null}

            {onboardingStep === 1 ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-slate-900">1. ¿Cuál es el destino principal?</p>
                <div className="flex flex-wrap gap-2">
                  {["Roma", "París", "Lisboa", "Nueva York", "Tokio"].map((city) => (
                    <button
                      key={city}
                      type="button"
                      onClick={() => {
                        setOnboardingDraft((d) => ({ ...d, destination: city }));
                        setOnboardingStep(2);
                      }}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                    >
                      {city}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-500">O escribe el destino en el cuadro de abajo y pulsa Enviar.</p>
              </div>
            ) : null}

            {onboardingStep === 2 ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-slate-900">2. ¿Cuánto dura el viaje?</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: "3 días", nights: 3 },
                    { label: "5 días", nights: 5 },
                    { label: "1 semana", nights: 7 },
                    { label: "10 días", nights: 10 },
                  ].map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => {
                        applyDurationChips(opt.nights);
                        setOnboardingStep(3);
                      }}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-500">
                  También puedes escribir fechas o aclaraciones (ej. «del 3 al 9 de agosto») abajo y pulsar Enviar.
                </p>
              </div>
            ) : null}

            {onboardingStep === 3 ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-slate-900">3. ¿Cuántas personas viajáis?</p>
                <div className="flex flex-wrap gap-2">
                  {[2, 3, 4, 6].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => {
                        setOnboardingDraft((d) => ({ ...d, partySize: n }));
                        setOnboardingStep(4);
                      }}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                    >
                      {n === 6 ? "6 o más" : String(n)}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {onboardingStep === 4 ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-slate-900">4. ¿Qué tipo de viaje buscáis?</p>
                <div className="flex flex-wrap gap-2">
                  {["Cultura", "Fiesta", "Naturaleza", "Relax", "Barato", "Premium", "Mixto"].map((style) => (
                    <button
                      key={style}
                      type="button"
                      onClick={() => void finalizeOnboardingWithAi({ tripStyle: style })}
                      disabled={onboardingBusy || loading}
                      className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-sm font-semibold text-violet-950 hover:bg-violet-100 disabled:opacity-50"
                    >
                      {style}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-500">Al elegir un estilo se generará un borrador de itinerario con la IA (luego puedes ejecutarlo en el plan).</p>
              </div>
            ) : null}
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
                    const nAct = typeof payload?.created === "number" ? payload.created : null;
                    const nRoutes = typeof payload?.routesCreated === "number" ? payload.routesCreated : null;
                    const note = typeof payload?.routesNote === "string" ? payload.routesNote : "";
                    const actMsg = nAct != null ? `${nAct} actividades` : "varias actividades";
                    const routeMsg =
                      nRoutes != null && nRoutes > 0 ? ` y ${nRoutes} rutas en el mapa` : nRoutes === 0 ? "" : "";
                    setInfo(
                      [`Plan ejecutado: ${actMsg}${routeMsg}.`, note].filter(Boolean).join(" ")
                    );
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
              {mode === "day_planner" ? (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                  En <span className="font-semibold">Organizar día</span>, las actividades y las rutas se guardan con{" "}
                  <span className="font-semibold">Aplicar cambios</span> (no uses “Ejecutar plan”, que es solo para
                  itinerarios en JSON incrustados en el chat).
                </div>
              ) : null}
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
        <aside className="order-2 space-y-5 xl:order-1 xl:space-y-6">
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
                  <div className="mt-1 text-xs opacity-70">
                    {MODE_LABELS[item.mode as ExtendedChatMode] || item.mode}
                  </div>
                </button>
              )) : (
                <p className="text-sm text-slate-500">Todavía no hay conversaciones guardadas.</p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setChatTypesOpen((v) => !v)}
            aria-expanded={chatTypesOpen}
            className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
          >
            {chatTypesOpen ? "Ocultar tipos" : "Mostrar tipos"}
          </button>

          {chatTypesOpen ? (
            <div className="space-y-4">
              <div
                className="no-scrollbar flex gap-2 overflow-x-auto pb-1 xl:hidden"
                role="tablist"
                aria-label="Tipo de chat"
              >
                {MODE_OPTIONS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={mode === item.id}
                    onClick={() => setMode(item.id)}
                    className={`shrink-0 rounded-full border px-3.5 py-2 text-xs font-semibold transition ${
                      mode === item.id
                        ? "border-violet-400 bg-violet-50 text-violet-950 shadow-sm"
                        : item.group === "write"
                          ? "border-amber-200/80 bg-amber-50/80 text-amber-950"
                          : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-bold text-slate-950">Tipo de chat</h2>
                <p className="mt-2 text-xs leading-relaxed text-slate-600">
                  Cambia de modo antes de enviar: cada uno activa instrucciones distintas para la IA. Nada se borra:
                  todos los modos siguen aquí.
                </p>
                <div className="mt-5 space-y-6">
                  {MODE_GROUPS.map((g) => (
                    <div key={g.id}>
                      <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-500">{g.title}</p>
                      <p className="mt-1 text-[11px] leading-snug text-slate-500">{g.hint}</p>
                      <div className="mt-3 space-y-2">
                        {MODE_OPTIONS.filter((m) => m.group === g.id).map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setMode(item.id)}
                            className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                              mode === item.id
                                ? "border-violet-300 bg-violet-50 shadow-sm"
                                : g.id === "write"
                                  ? "border-amber-200/70 bg-amber-50/50 hover:bg-amber-50"
                                  : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-semibold text-slate-900">{item.label}</span>
                              {mode === item.id ? (
                                <span className="shrink-0 rounded-full bg-violet-200/80 px-2 py-0.5 text-[10px] font-bold text-violet-900">
                                  Activo
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-0.5 text-xs font-medium text-slate-600">{item.description}</div>
                            <div className="mt-1.5 text-[11px] leading-snug text-slate-500">
                              <span className="font-semibold text-slate-600">Cuándo:</span> {item.useFor}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

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

        <section className="chat-panel order-1 min-w-0 rounded-[28px] border border-slate-200 bg-white shadow-sm xl:order-2">
          <div className="border-b border-slate-200 px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-slate-950">Conversación</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Modo:{" "}
                  <span className="font-semibold text-slate-800">
                    {modeSource === "auto" ? "Automático" : activeMode?.label || mode}
                  </span>
                  {modeSource === "manual" && activeMode ? (
                    <span className="mt-0.5 block text-xs text-slate-500 xl:hidden">{activeMode.useFor}</span>
                  ) : null}
                </p>
                <p className="mt-1 hidden text-xs text-slate-500 xl:block">
                  {modeSource === "auto"
                    ? "Modo automático: la intención se traduce en acción y resumen del viaje (sin enviar todo el historial)."
                    : "Modo manual: controlas el tipo de respuesta de la IA."}
                </p>
              </div>

              <div className="flex flex-col items-end gap-2">
                <label className="flex flex-col items-end gap-1 text-[11px] font-semibold text-slate-600">
                  Modo IA
                  <select
                    value={modeSource === "manual" ? mode : "auto"}
                    onChange={(e) => {
                      const v = e.target.value as "auto" | ExtendedChatMode;
                      if (v === "auto") {
                        setModeSource("auto");
                      } else {
                        setModeSource("manual");
                        setMode(v);
                      }
                    }}
                    className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-800 shadow-sm"
                  >
                    <option value="auto">Automático (recomendado)</option>
                    <option value="general">Manual · General</option>
                    <option value="planning">Manual · Planificación</option>
                    <option value="expenses">Manual · Gastos</option>
                    <option value="optimizer">Manual · Optimizador</option>
                    <option value="actions">Manual · Acciones</option>
                    <option value="day_planner">Manual · Organizar día</option>
                  </select>
                </label>
                <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  {loading ? "Pensando..." : "Listo"}
                </div>
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
                  className={`max-w-[88%] whitespace-pre-wrap rounded-[24px] px-4 py-3 text-sm leading-7 ${
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

          <div className="border-t border-slate-200 px-5 py-3">
            <p className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-500">Sugerencias</p>
            <div className="flex flex-wrap gap-2">
              {SMART_CHIPS.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  disabled={loading || !isPremium}
                  onClick={() => void sendMessage(c.prompt, c.action)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleSubmit} className="border-t border-slate-200 p-5">
            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-3">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                rows={4}
                placeholder={inputPlaceholder}
                disabled={!isPremium}
                className="min-h-[120px] w-full resize-none rounded-2xl border-0 bg-transparent px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400"
              />

              <div className="flex flex-col gap-3 border-t border-slate-200 px-2 pt-3 md:flex-row md:items-center md:justify-between">
                <p className="min-w-0 flex-1 text-xs leading-snug text-slate-500">
                  <span className="font-semibold text-slate-700">{activeMode?.label}</span>
                  {activeMode ? <span className="text-slate-500"> — {activeMode.useFor}</span> : null}
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
