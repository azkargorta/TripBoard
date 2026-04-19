"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TripScreenActions from "@/components/trip/common/TripScreenActions";
import TripBoardPageHeader from "@/components/layout/TripBoardPageHeader";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, FileText, MessageCircle, Route } from "lucide-react";
import type { TripAiMode } from "@/lib/trip-ai/buildPrompt";
import { useTripData } from "@/hooks/useTripData";
import { useTripActivities } from "@/hooks/useTripActivities";
import { useTripAiOnboarding, type OnboardingDraft } from "@/components/trip/ai/useTripAiOnboarding";
import type { AIActionId } from "@/lib/trip-ai/aiActions";
import type { TripAssistantSurface } from "@/lib/trip-assistant-context";
import { parseTravelDocsChecklistFromAnswer } from "@/lib/trip-ai/travelDocsChecklist";
import TravelDocsChecklistCard from "@/components/trip/ai/TravelDocsChecklistCard";

type TripAiChatLayout = "page" | "drawer";

type AssistantContextPreset = {
  mode: TripAiMode;
  modeSource: "auto" | "manual";
  welcome: string;
};

function assistantContextPreset(surface: TripAssistantSurface): AssistantContextPreset {
  switch (surface) {
    case "plan":
      return {
        mode: "planning",
        modeSource: "manual",
        welcome:
          "Estás en Plan: me centraré en crear o reorganizar el itinerario por días (visitas, horarios, propuestas).\n\n" +
          "Si ya tienes destino y fechas, pide un borrador de N días o dime qué quieres cambiar. Cuando haya un itinerario listo, podrás usar «Ejecutar plan» o «Aplicar cambios» según el formato que devuelva el asistente.",
      };
    case "routes":
      return {
        mode: "optimizer",
        modeSource: "manual",
        welcome:
          "Estás en Rutas: me centro en trayectos entre paradas, orden geográfico del día y cómo conectar lo que ya hay en el plan.\n\n" +
          "Pide crear rutas entre paradas concretas, mejorar el orden para menos desplazamiento o revisar huecos en el recorrido. Los cambios aplicables pueden salir como bloque para «Aplicar cambios».",
      };
    case "expenses":
      return {
        mode: "expenses",
        modeSource: "manual",
        welcome:
          "Estás en Gastos: repasemos balances, quién debe a quién, ideas para repartir pagos y presupuesto del grupo.",
      };
    case "resources":
      return {
        mode: "general",
        modeSource: "manual",
        welcome:
          "Estás en Docs: puedo orientarte sobre qué subir (PDF, capturas de vuelo u hotel), cómo organizar reservas y qué revisar antes del viaje.",
      };
    case "participants":
      return {
        mode: "general",
        modeSource: "manual",
        welcome:
          "Estás en Gente: conviene aclarar invitaciones, permisos (quién edita plan, rutas o gastos) y cómo presentar el viaje al grupo.",
      };
    case "summary":
      return {
        mode: "general",
        modeSource: "manual",
        welcome:
          "Estás en Resumen: puedo darte una visión general del viaje (fechas, destino, qué falta por preparar) y sugerirte los siguientes pasos.",
      };
    default:
      return {
        mode: "general",
        modeSource: "auto",
        welcome: "",
      };
  }
}

const DEFAULT_PAGE_WELCOME =
  "Bienvenido ✈️\n\n" +
  "Elige abajo el **foco** del asistente (planificador, un día y desplazamientos, chat general o documentos). Escribe con naturalidad o pulsa «Sugerir itinerario» si el plan está vacío.\n\n" +
  "Cuando salga el itinerario en formato ejecutable, «Ejecutar plan» lo vuelca al mapa y al plan; los retoques puntuales van con «Aplicar cambios».";

const PLANNER_FOCUS_WELCOME =
  "Modo **Planificador (todo el viaje)**\n\n" +
  "Aquí preparo un itinerario que cubre **cada día del calendario** de este viaje (con actividades o, si toca, días de traslado/descanso explícitos), no solo un resumen.\n\n" +
  "Cuando el JSON esté listo, usa **«Ejecutar plan»** para volcarlo al Plan y al mapa. Si faltan país inequívoco o fechas, te preguntaré antes.\n\n" +
  "Puedes describir ritmo y prioridades, o pulsar «Sugerir itinerario» si el plan está vacío.";

const DAY_FOCUS_WELCOME =
  "Modo **Desplazamientos y un día**\n\n" +
  "Pensado para **un día concreto**: horarios, comidas y cómo moveros (andando, coche, etc.). Las respuestas pasan por el motor de **Organizar día**; luego podrás **Aplicar cambios** en el plan.\n\n" +
  "Indica la **fecha (YYYY-MM-DD)**, ciudad con **país** y el ritmo que buscáis.";

/** Apertura al entrar en modo documentos (cambio manual o `?modo=travel_docs`). */
const OPENING_TRAVEL_DOCS =
  "Dime tu nacionalidad y qué países vas a visitar o en los que harás escala, y miraré qué documentos o seguros necesitas.";

function getManualModeWelcome(next: TripAiMode): string {
  switch (next) {
    case "travel_docs":
      return OPENING_TRAVEL_DOCS;
    case "planning":
      return PLANNER_FOCUS_WELCOME;
    case "day_planner":
      return DAY_FOCUS_WELCOME;
    case "general":
      return "Modo **chat general**. Cuéntame en qué puedo ayudarte con este viaje (resumen, dudas, recomendaciones).";
    case "expenses":
      return "Modo **gastos**. Pregunta por totales, balances, quién debe a quién o qué conviene registrar.";
    case "optimizer":
      return "Modo **optimizador**. Pide huecos en el plan, orden geográfico del día o ideas para aprovechar mejor el tiempo y las rutas.";
    case "actions":
      return "Modo **acciones**. Pide cambios concretos en actividades o rutas; si el asistente devuelve el bloque adecuado, podrás usar **«Aplicar cambios»**.";
    default:
      return DEFAULT_PAGE_WELCOME;
  }
}

const KNOWN_TRIP_AI_MODES = new Set<string>([
  "general",
  "planning",
  "expenses",
  "optimizer",
  "actions",
  "day_planner",
  "travel_docs",
]);

function coerceTripAiMode(value: unknown): TripAiMode {
  return typeof value === "string" && KNOWN_TRIP_AI_MODES.has(value) ? (value as TripAiMode) : "general";
}

function buildInitialWelcomeMessages(params: {
  layout: TripAiChatLayout;
  ctxPreset: AssistantContextPreset | null;
  defaultAssistantMode: TripAiMode | null;
}): Message[] {
  if (params.layout === "drawer" && params.ctxPreset?.welcome) {
    return [{ id: "welcome", role: "assistant", content: params.ctxPreset.welcome }];
  }
  if (params.defaultAssistantMode === "planning") {
    return [{ id: "welcome", role: "assistant", content: PLANNER_FOCUS_WELCOME }];
  }
  if (params.defaultAssistantMode === "day_planner") {
    return [{ id: "welcome", role: "assistant", content: DAY_FOCUS_WELCOME }];
  }
  if (params.defaultAssistantMode === "travel_docs") {
    return [{ id: "welcome", role: "assistant", content: OPENING_TRAVEL_DOCS }];
  }
  return [{ id: "welcome", role: "assistant", content: DEFAULT_PAGE_WELCOME }];
}

type LucideIcon = typeof MessageCircle;

const ASSISTANT_FOCUS_PRESETS: Array<{
  id: TripAiMode;
  label: string;
  description: string;
  Icon: LucideIcon;
}> = [
  {
    id: "planning",
    label: "Planificador",
    description: "Todos los días del viaje. Itinerario + «Ejecutar plan».",
    Icon: CalendarDays,
  },
  {
    id: "day_planner",
    label: "Desplazamientos",
    description: "Un día con horarios y cómo moveros.",
    Icon: Route,
  },
  {
    id: "general",
    label: "Chat general",
    description: "Resúmenes, dudas amplias y recomendaciones.",
    Icon: MessageCircle,
  },
  {
    id: "travel_docs",
    label: "Documentos",
    description: "Visados, seguros, tasas según nacionalidad y países.",
    Icon: FileText,
  },
];

type Conversation = {
  id: string;
  title: string;
  mode: TripAiMode;
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

/** Oculta bloques JSON internos en la burbuja; el texto completo sigue en estado para extraer itinerario/diff. */
function stripTripboardJsonBlocksForDisplay(content: string): string {
  const blocks = [
    {
      start: "TRIPBOARD_ITINERARY_JSON_START",
      end: "TRIPBOARD_ITINERARY_JSON_END",
      label: "Itinerario generado (panel «Itinerario propuesto» arriba)",
    },
    {
      start: "TRIPBOARD_DIFF_JSON_START",
      end: "TRIPBOARD_DIFF_JSON_END",
      label: "Cambios propuestos (panel «Aplicar cambios» arriba)",
    },
    {
      start: "TRIPBOARD_TRAVEL_DOCS_JSON_START",
      end: "TRIPBOARD_TRAVEL_DOCS_JSON_END",
      label: "Checklist de documentos (tarjeta debajo del mensaje)",
    },
  ];
  let out = content;
  for (const { start, end, label } of blocks) {
    for (;;) {
      const a = out.indexOf(start);
      const b = out.indexOf(end);
      if (a === -1 || b === -1 || b < a) break;
      const replacement = `\n\n— ${label} —\n\n`;
      out = out.slice(0, a) + replacement + out.slice(b + end.length);
    }
  }
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

type ModeOption = {
  id: TripAiMode;
  label: string;
  /** Cuándo elegirlo (texto orientativo) */
  useFor: string;
};

const MODE_OPTIONS: ModeOption[] = [
  {
    id: "general",
    label: "General",
    useFor: "Resúmenes, qué tienes guardado, recomendaciones generales.",
  },
  {
    id: "planning",
    label: "Planificación",
    useFor: "Varios días, orden de visitas, propuestas de agenda (itinerario en JSON + «Ejecutar plan»).",
  },
  {
    id: "expenses",
    label: "Gastos",
    useFor: "Cuánto se ha gastado, quién debe a quién, ideas para pagar.",
  },
  {
    id: "optimizer",
    label: "Optimizador",
    useFor: "Detectar huecos, solapes o formas de aprovechar mejor el plan.",
  },
  {
    id: "actions",
    label: "Acciones",
    useFor: "Pedir al asistente personal que cree o modifique actividades/rutas vía «diff» revisable.",
  },
  {
    id: "day_planner",
    label: "Organizar día",
    useFor: "Un solo día: horarios, comidas, desplazamientos; guardas con «Aplicar cambios» (no «Ejecutar plan»).",
  },
  {
    id: "travel_docs",
    label: "Documentos del viaje",
    useFor: "Visados, seguros, tasas y requisitos según nacionalidad y países a visitar.",
  },
];

const MODE_LABELS: Record<TripAiMode, string> = {
  general: "General",
  planning: "Planificación",
  expenses: "Gastos",
  optimizer: "Optimizador",
  actions: "Acciones",
  day_planner: "Organizar día",
  travel_docs: "Documentos",
};

const PLACEHOLDERS: Record<TripAiMode, string> = {
  general: "Ej.: hazme un resumen del viaje o qué documentos conviene llevar…",
  planning: "Ej.: dame un plan de 3 días en Roma o reorganiza mis visitas…",
  expenses: "Ej.: ¿cuánto llevamos gastado? ¿quién debe a quién?…",
  optimizer: "Ej.: detecta huecos en mi plan o sugiere mejoras…",
  actions: "Ej.: añade una cena el viernes en el plan o crea una ruta entre dos puntos…",
  day_planner:
    "Ej.: organízame el 2026-06-15 en Ámsterdam, andando, de 10:00 a 21:00… (luego «Aplicar cambios» para guardar)",
  travel_docs:
    "Ej.: pasaporte español, viajo a Marruecos y Turquía en junio — ¿qué documentos y trámites necesito?",
};

const SMART_CHIPS: Array<{ label: string; prompt: string; action: AIActionId }> = [
  { label: "✨ Optimizar viaje", prompt: "Optimiza el viaje: detecta huecos, solapes y mejoras prácticas.", action: "optimize_route" },
  { label: "🗺️ Mejorar rutas", prompt: "Mejora el orden geográfico y las rutas entre paradas para desperdiciar menos tiempo.", action: "optimize_route" },
  { label: "💸 Ajustar presupuesto", prompt: "Ayúdame a revisar el presupuesto y el reparto de gastos con lo que ya tenemos.", action: "adjust_budget" },
  { label: "🍽️ Añadir restaurantes", prompt: "Sugiere restaurantes que encajen y, si aplica, añade actividades tipo restaurante al plan.", action: "add_activity" },
];

const SUGGESTIONS: Record<TripAiMode, string[]> = {
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
  travel_docs: [
    "Pasaporte colombiano: voy 10 días a España y Francia en verano. ¿Qué necesito?",
    "Nacionalidad mexicana, solo Reino Unido 1 semana. Lista de documentos y seguros.",
    "¿ETIAS o visado si entro en Grecia y luego Croacia con pasaporte argentino?",
  ],
};

export default function TripAiChatView({
  tripId,
  isPremium = true,
  layout = "page",
  assistantContext = null,
  autoBootstrapItinerary = false,
  launchIntent = null,
  defaultAssistantMode = null,
}: {
  tripId: string;
  isPremium?: boolean;
  /** `drawer`: panel compacto sin cabecera de página ni columna de conversaciones. */
  layout?: TripAiChatLayout;
  /** Si viene del panel contextual, fija modo y mensaje inicial acorde a la pestaña. */
  assistantContext?: TripAssistantSurface | null;
  /**
   * Tras crear viaje con `?recien=1`: si el servidor detectó plan vacío + destino o fechas inicio/fin,
   * se lanza una sola vez «Sugerir itinerario» equivalente (opción C conservadora).
   */
  autoBootstrapItinerary?: boolean;
  /** Atajos desde el dashboard: envía un primer mensaje y limpia la URL al terminar bien. */
  launchIntent?: "optimize" | "auto_plans" | null;
  /** Desde `?modo=…` en la URL (p. ej. planificador al crear viaje). Ignorado si hay `assistantContext` en drawer. */
  defaultAssistantMode?: TripAiMode | null;
}) {
  const ctxPreset = assistantContext ? assistantContextPreset(assistantContext) : null;
  const router = useRouter();
  const pathname = usePathname();
  if (!isPremium) {
    return (
      <main className="space-y-6">
        <TripBoardPageHeader
          section="Asistente personal del viaje"
          title="Asistente personal"
          description="Esta página está reservada a usuarios Premium."
          iconSrc="/brand/tabs/ai.png"
          iconAlt="Asistente personal"
          actions={<TripScreenActions tripId={tripId} />}
        />

        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6">
          <div className="text-sm font-semibold text-amber-950">
            Esta página está reservada a usuarios premium.
          </div>
          <div className="mt-2 text-sm text-amber-900/80">
            Mejora a Premium para habilitar el asistente personal, memoria, acciones y optimización del viaje.
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

  const [mode, setMode] = useState<TripAiMode>(() => ctxPreset?.mode ?? defaultAssistantMode ?? "general");
  const [provider, setProvider] = useState<"auto" | "gemini" | "ollama">("auto");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>(() =>
    buildInitialWelcomeMessages({
      layout,
      ctxPreset,
      defaultAssistantMode: ctxPreset ? null : defaultAssistantMode ?? null,
    })
  );
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
  const [planConflictOpen, setPlanConflictOpen] = useState(false);
  const [expandedDay, setExpandedDay] = useState<number | null>(null);
  const dayStripRef = useRef<HTMLDivElement | null>(null);
  const [dayStripEdges, setDayStripEdges] = useState({ left: false, right: false });
  const [modeSource, setModeSource] = useState<"auto" | "manual">(() =>
    ctxPreset?.modeSource ?? (defaultAssistantMode ? "manual" : "auto")
  );
  const [planActivityCount, setPlanActivityCount] = useState<number | null>(null);
  const [onboardingBusy, setOnboardingBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const { trip, reload: reloadTrip, loading: tripDataLoading } = useTripData(tripId);
  const { activities: tripPlanActivities, reload: reloadTripPlanActivities, loading: tripPlanActivitiesLoading } =
    useTripActivities(tripId);

  const draftHasCalendarDates = useMemo(() => {
    if (!itineraryDraft) return false;
    return itineraryDraft.days.some((d) => typeof d.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.date));
  }, [itineraryDraft]);

  const itineraryConflictDates = useMemo(() => {
    if (!itineraryDraft) return [];
    const draftDates = new Set<string>();
    for (const day of itineraryDraft.days) {
      const d = day.date;
      if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) draftDates.add(d);
    }
    if (!draftDates.size) return [];
    const used = new Set<string>();
    for (const a of tripPlanActivities) {
      const ad = a.activity_date;
      if (typeof ad === "string" && draftDates.has(ad)) used.add(ad);
    }
    return Array.from(used).sort();
  }, [itineraryDraft, tripPlanActivities]);

  const runExecutePlan = useCallback(
    async (conflictResolution: "add" | "replace") => {
      const draft = itineraryDraft;
      if (!draft) return;
      setExecutingPlan(true);
      setInfo(null);
      setError(null);
      setPlanConflictOpen(false);
      try {
        const res = await fetch("/api/trip-ai/execute-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tripId, itinerary: draft, conflictResolution }),
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok) throw new Error(payload?.error || "No se pudo ejecutar el plan.");
        const nAct = typeof payload?.created === "number" ? payload.created : null;
        const nRoutes = typeof payload?.routesCreated === "number" ? payload.routesCreated : null;
        const note = typeof payload?.routesNote === "string" ? payload.routesNote : "";
        const actMsg = nAct != null ? `${nAct} actividades` : "varias actividades";
        const routeMsg =
          nRoutes != null && nRoutes > 0 ? ` y ${nRoutes} rutas en el mapa` : nRoutes === 0 ? "" : "";
        setInfo([`Plan ejecutado: ${actMsg}${routeMsg}.`, note].filter(Boolean).join(" "));
        setItineraryDraft(null);
        setExpandedDay(null);
        void reloadTrip();
        void reloadTripPlanActivities();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo ejecutar el plan.");
      } finally {
        setExecutingPlan(false);
      }
    },
    [itineraryDraft, tripId, reloadTrip, reloadTripPlanActivities]
  );

  const syncDayStripEdges = useCallback(() => {
    const el = dayStripRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    if (maxScroll <= 2) {
      setDayStripEdges({ left: false, right: false });
      return;
    }
    setDayStripEdges({
      left: el.scrollLeft > 4,
      right: el.scrollLeft < maxScroll - 4,
    });
  }, []);

  const scrollDayStrip = useCallback((dir: "left" | "right") => {
    const el = dayStripRef.current;
    if (!el) return;
    const step = Math.max(200, Math.floor(el.clientWidth * 0.72));
    el.scrollBy({ left: dir === "left" ? -step : step, behavior: "smooth" });
  }, []);

  useEffect(() => {
    if (!itineraryDraft) {
      setDayStripEdges({ left: false, right: false });
      return;
    }
    const el = dayStripRef.current;
    if (!el) return;
    const onScroll = () => syncDayStripEdges();
    const ro = new ResizeObserver(() => syncDayStripEdges());
    ro.observe(el);
    el.addEventListener("scroll", onScroll, { passive: true });
    requestAnimationFrame(() => syncDayStripEdges());
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", onScroll);
    };
  }, [itineraryDraft, itineraryDraft?.days?.length, syncDayStripEdges]);

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
    onboardingDraft,
    setOnboardingDraft,
    skipOnboarding,
    markOnboardingComplete,
  } = useTripAiOnboarding({
    tripId,
    tripLoaded: !tripDataLoading && planActivityCount !== null && Boolean(trip),
    planActivityCount,
  });

  const beginNewChatForMode = useCallback(
    (next: TripAiMode | "auto", opts?: { onlyIfChanged?: boolean }) => {
      if (opts?.onlyIfChanged) {
        if (next === "auto" && modeSource === "auto") return;
        if (next !== "auto" && modeSource === "manual" && mode === next) return;
      }

      setConversationId(null);
      setItineraryDraft(null);
      setPlanConflictOpen(false);
      setDiffDraft(null);
      setDiffContext(null);
      setDiffContextLoading(false);
      setDiffSelected(new Set());
      setDiffAllowDeletes(false);
      setApplyingDiff(false);
      setExpandedDay(null);
      setQuestion("");
      setInfo(null);
      setError(null);

      if (next === "auto") {
        if (layout === "drawer" && ctxPreset?.welcome) {
          setModeSource(ctxPreset.modeSource);
          setMode(ctxPreset.mode);
          setMessages([
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: ctxPreset.welcome,
            },
          ]);
        } else {
          setModeSource("auto");
          setMode("general");
          setMessages([
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: DEFAULT_PAGE_WELCOME,
            },
          ]);
        }
        return;
      }

      if (onboardingActive) skipOnboarding();

      setModeSource("manual");
      setMode(next);
      setMessages([
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: getManualModeWelcome(next),
        },
      ]);
    },
    [ctxPreset, layout, mode, modeSource, onboardingActive, skipOnboarding]
  );

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

    // Si el asistente personal se sale del formato
    return {
      kind: "unknown",
      title: `Operación no reconocida: ${rawOp || "unknown"}`,
      subtitle: null,
      date: null,
      tone: "warn",
      details: "El asistente personal devolvió un formato distinto al esperado. Puedes descartarlo.",
      raw: op,
    };
  }

  const currentSuggestions = useMemo(() => SUGGESTIONS[mode], [mode]);

  const placeholder = useMemo(() => PLACEHOLDERS[mode], [mode]);

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
      const raw = Array.isArray(data?.conversations) ? data.conversations : [];
      setConversations(
        raw.map((c: Conversation) => ({
          ...c,
          mode: coerceTripAiMode((c as Conversation).mode),
        }))
      );
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
      if (data?.conversation?.mode) setMode(coerceTripAiMode(data.conversation.mode));
      setInfo(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo abrir la conversación.");
    } finally {
      setLoading(false);
    }
  }

  function newConversation() {
    setConversationId(null);
    if (layout === "drawer" && ctxPreset) {
      setModeSource(ctxPreset.modeSource);
      setMode(ctxPreset.mode);
      setMessages([
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: ctxPreset.welcome,
        },
      ]);
    } else {
      const def = defaultAssistantMode ?? null;
      setModeSource(def ? "manual" : "auto");
      setMode(def ?? "general");
      setMessages([
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: buildInitialWelcomeMessages({ layout, ctxPreset: null, defaultAssistantMode: def })[0]?.content ?? DEFAULT_PAGE_WELCOME,
        },
      ]);
    }
    setQuestion("");
    setInfo(null);
    setError(null);
  }

  async function sendMessage(
    customQuestion?: string,
    forcedAiAction?: AIActionId | null,
    hooks?: { onSuccess?: () => void; onError?: () => void }
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

      const rawText = await res.text();
      let data: Record<string, unknown> | null = null;
      try {
        data = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : null;
      } catch {
        data = null;
      }
      if (!res.ok) {
        const fromJson = typeof data?.error === "string" ? data.error : "";
        const fallback = rawText.trim().slice(0, 800);
        throw new Error(fromJson || fallback || "No se pudo obtener respuesta.");
      }

      if (!data) {
        throw new Error("Respuesta vacía del servidor.");
      }

      if (mode !== "day_planner") {
        const nextConv =
          typeof data.conversationId === "string" && data.conversationId
            ? data.conversationId
            : conversationId;
        setConversationId(nextConv);
      }
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: typeof data.answer === "string" ? data.answer : "No se pudo generar respuesta",
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
        const answerStr = typeof data.answer === "string" ? data.answer : "";
        const maybe = answerStr ? extractItinerary(answerStr) : null;
        if (maybe) setItineraryDraft(maybe);
        if (maybe) setExpandedDay(null);

        const maybeDiff = answerStr ? extractDiff(answerStr) : null;
        if (maybeDiff) setDiffDraft(maybeDiff);
      }

      if (data?.actionExecuted && data?.actionResult) {
        setInfo(String(data.actionResult));
      }

      if (mode === "day_planner" && typeof data?.dayPlannerHint === "string" && data.dayPlannerHint) {
        setInfo(String(data.dayPlannerHint));
      }

      await loadConversations();
      if (onboardingActive) markOnboardingComplete();
      hooks?.onSuccess?.();
    } catch (err) {
      hooks?.onError?.();
      const detail = err instanceof Error ? err.message : "No se pudo obtener respuesta.";
      setError(detail);
      const timeoutLike = /FUNCTION_INVOCATION_TIMEOUT|\b504\b|Gateway Timeout|timed out/i.test(detail);
      const timeoutHint = timeoutLike
        ? "\n\nSi ves timeout de despliegue: el servidor cortó la petición por tiempo. Espera un momento y reintenta; si tu plan Vercel limita la duración de funciones, puede hacer falta subir de plan. También puedes pedir un ritmo más relajado (menos paradas por día) en la misma petición."
        : "";
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            "No pude completar la respuesta del servidor.\n\n" +
            `Detalle: ${detail}\n\n` +
            "Si habla de cuota o API (Gemini), espera un poco o revisa GEMINI_API_KEY. Si el mensaje era muy largo, prueba una petición más corta." +
            timeoutHint,
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
      const dest = (merged.destination || trip?.destination || trip?.name || "").trim();
      if (!dest) {
        setError("Indica un destino (en el chat o en el nombre/resumen del viaje) para generar el plan.");
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
        `Genera un itinerario completo para todos los días del viaje y devuelve un único bloque JSON según el modo planificación (sin omitir días salvo que el usuario haya pedido solo un tramo).`,
        `Destino principal: ${dest}.`,
        datePart,
        merged.partySize ? `Personas aprox.: ${merged.partySize}.` : "",
        merged.tripStyle ? `Tipo de viaje: ${merged.tripStyle}.` : "",
        `Incluye 2–4 paradas por día cuando tenga sentido, con ritmo equilibrado; en viajes largos puedes bajar a 2–3 por día para cubrir todo el periodo sin repetir visitas.`,
      ]
        .filter(Boolean)
        .join(" ");

      await sendMessage(prompt, "generate_trip");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar la guía inicial.");
    } finally {
      setOnboardingBusy(false);
    }
  }

  function defaultFiveDayWindow(): { startDate: string; endDate: string } {
    const start = new Date();
    start.setUTCDate(start.getUTCDate() + 21);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 4);
    return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) };
  }

  async function quickBootstrapPlan(pickedDestination?: string) {
    if (!isPremium || onboardingBusy) return;
    const dest = (pickedDestination || trip?.destination?.trim() || trip?.name?.trim() || "").trim();
    if (!dest) {
      setError(
        "Falta un destino: escríbelo en el chat (ej. «Oporto 4 días») o edita nombre/destino del viaje en el resumen."
      );
      return;
    }
    let startDate = trip?.start_date ?? null;
    let endDate = trip?.end_date ?? null;
    if (!startDate || !endDate || startDate > endDate) {
      const w = defaultFiveDayWindow();
      startDate = w.startDate;
      endDate = w.endDate;
    }
    await finalizeOnboardingWithAi({
      destination: dest,
      startDate,
      endDate,
      partySize: 2,
      tripStyle: "Mixto",
      dateNotes: null,
    });
  }

  const autoBootstrapOnceRef = useRef(false);
  useEffect(() => {
    if (!autoBootstrapItinerary || layout !== "page") return;
    if (!trip || tripDataLoading) return;
    if (planActivityCount === null || planActivityCount > 0) return;
    if (loading || onboardingBusy) return;

    let allow = false;
    try {
      const key = `kaviro_ai_autoboot_itin:${tripId}`;
      if (typeof window !== "undefined" && window.sessionStorage.getItem(key) === "1") return;
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(key, "1");
      }
      allow = true;
    } catch {
      if (autoBootstrapOnceRef.current) return;
      autoBootstrapOnceRef.current = true;
      allow = true;
    }
    if (!allow) return;

    void quickBootstrapPlan();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- una sola vez al cumplir condiciones; quickBootstrapPlan es estable en intención
  }, [
    autoBootstrapItinerary,
    layout,
    trip,
    tripDataLoading,
    planActivityCount,
    loading,
    onboardingBusy,
    tripId,
  ]);

  useEffect(() => {
    if (!launchIntent || layout !== "page" || !isPremium) return;
    if (!trip || tripDataLoading) return;
    if (loading || onboardingBusy) return;

    const storageKey = `kaviro_dash_launch:${tripId}:${launchIntent}`;
    let timeoutId = 0;
    let cancelled = false;

    try {
      const st = typeof window !== "undefined" ? window.sessionStorage.getItem(storageKey) : null;
      if (st === "done" || st === "inflight") return;
      if (typeof window !== "undefined") window.sessionStorage.setItem(storageKey, "inflight");
    } catch {
      /* ignore */
    }

    skipOnboarding();

    const run = () => {
      if (cancelled) return;
      if (launchIntent === "optimize") {
        setMode("optimizer");
        setModeSource("manual");
        void sendMessage("Optimiza el viaje: detecta huecos, solapes y mejoras prácticas.", "optimize_route", {
          onSuccess: () => {
            try {
              if (typeof window !== "undefined") window.sessionStorage.setItem(storageKey, "done");
            } catch {
              /* ignore */
            }
            router.replace(pathname);
          },
          onError: () => {
            try {
              if (typeof window !== "undefined") window.sessionStorage.removeItem(storageKey);
            } catch {
              /* ignore */
            }
          },
        });
      } else {
        setMode("planning");
        setModeSource("manual");
        void sendMessage(
          "Completa el itinerario con propuestas concretas (visitas, comidas, desplazamientos) alineadas con destino, fechas y lo ya planificado. Si hay días vacíos o poco cubiertos, rellénalos; si casi no hay planes, propon un calendario por días ejecutable cuando aplique.",
          null,
          {
            onSuccess: () => {
              try {
                if (typeof window !== "undefined") window.sessionStorage.setItem(storageKey, "done");
              } catch {
                /* ignore */
              }
              router.replace(pathname);
            },
            onError: () => {
              try {
                if (typeof window !== "undefined") window.sessionStorage.removeItem(storageKey);
              } catch {
                /* ignore */
              }
            },
          }
        );
      }
    };

    timeoutId = window.setTimeout(run, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      try {
        if (typeof window !== "undefined" && window.sessionStorage.getItem(storageKey) === "inflight") {
          window.sessionStorage.removeItem(storageKey);
        }
      } catch {
        /* ignore */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- disparo único desde URL; sendMessage evoluciona cada render
  }, [
    launchIntent,
    layout,
    isPremium,
    trip,
    tripDataLoading,
    loading,
    onboardingBusy,
    tripId,
    pathname,
    router,
    skipOnboarding,
  ]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const clean = question.trim();
    if (!clean || loading) return;
    void sendMessage();
  }

  const showPageHeader = layout === "page";
  const showConvSidebar = layout === "page";
  const Root = layout === "drawer" ? "div" : "main";
  /** En drawer el panel tiene altura fija: columna flex + scroll solo en mensajes para que el envío quede visible. */
  const rootClass =
    layout === "drawer"
      ? "flex min-h-0 w-full min-w-0 max-w-full flex-1 flex-col gap-3 overflow-x-hidden overflow-y-hidden"
      : "w-full min-w-0 max-w-full space-y-6 overflow-x-hidden";

  return (
    <Root className={rootClass}>
      {showPageHeader ? (
        <TripBoardPageHeader
          section="Asistente personal del viaje"
          title="Asistente personal"
          description="Conversación libre con sugerencias y guía opcional al crear el plan. El asistente personal usa un resumen del viaje y acciones concretas (no todo el historial) para ahorrar tokens."
          iconSrc="/brand/tabs/ai.png"
          iconAlt="Asistente personal"
          actions={<TripScreenActions tripId={tripId} />}
        />
      ) : null}

      {onboardingActive ? (
        <section className="rounded-2xl border border-violet-200/70 bg-gradient-to-br from-violet-50 via-white to-sky-50 p-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-violet-800">Plan vacío</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">Montemos el viaje sin formularios largos</p>
              <p className="mt-1 text-sm text-slate-600">
                Un clic genera un <span className="font-semibold text-slate-800">borrador de 5 días</span> (ritmo mixto, 2 personas) usando el destino del viaje; luego lo cambias todo por chat. O escribe abajo lo que quieras y seguimos desde ahí: la primera respuesta cierra este aviso.
              </p>
              {trip?.destination?.trim() || trip?.name?.trim() ? (
                <p className="mt-2 text-xs text-slate-500">
                  Destino detectado:{" "}
                  <span className="font-semibold text-slate-700">{trip?.destination?.trim() || trip?.name?.trim()}</span>
                  {trip?.start_date && trip?.end_date ? (
                    <>
                      {" "}
                      · fechas del viaje: {trip.start_date} → {trip.end_date}
                    </>
                  ) : null}
                </p>
              ) : (
                <p className="mt-2 text-xs text-amber-800">
                  Aún no hay destino en el viaje: escribe en el chat (ej. «Oporto 4 días») o usa una ciudad de ejemplo.
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                disabled={onboardingBusy || loading}
                onClick={() => void quickBootstrapPlan()}
                className="inline-flex min-h-[44px] items-center justify-center rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
              >
                {onboardingBusy ? "Generando…" : "Sugerir itinerario"}
              </button>
              <button
                type="button"
                onClick={() => skipOnboarding()}
                disabled={onboardingBusy}
                className="inline-flex min-h-[44px] items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
              >
                Prefiero solo chat
              </button>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {["Roma", "París", "Lisboa", "Oporto", "Tokio"].map((city) => (
              <button
                key={city}
                type="button"
                disabled={onboardingBusy || loading}
                onClick={() => void quickBootstrapPlan(city)}
                className="rounded-full border border-violet-200 bg-white px-3 py-1.5 text-xs font-semibold text-violet-950 hover:bg-violet-50 disabled:opacity-50"
              >
                {city}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {planConflictOpen && itineraryDraft ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 px-4 py-8 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="plan-conflict-title"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div id="plan-conflict-title" className="text-sm font-extrabold text-slate-950">
              Ya hay planes en el calendario
            </div>
            <p className="mt-2 text-sm text-slate-600">
              Para{" "}
              {itineraryConflictDates.length === 1
                ? `el día ${itineraryConflictDates[0]}`
                : `estos días: ${itineraryConflictDates.join(", ")}`}{" "}
              ya tienes actividades en el plan. ¿Quieres sustituirlas por el nuevo itinerario o añadir las nuevas paradas
              a las que ya existen?
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              <button
                type="button"
                disabled={executingPlan}
                onClick={() => setPlanConflictOpen(false)}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={executingPlan}
                onClick={() => void runExecutePlan("add")}
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-900 shadow-sm transition hover:bg-violet-100 disabled:opacity-60"
              >
                Añadir a lo existente
              </button>
              <button
                type="button"
                disabled={executingPlan}
                onClick={() => void runExecutePlan("replace")}
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
              >
                Sustituir
              </button>
            </div>
          </div>
        </div>
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
              {dayStripEdges.right || dayStripEdges.left ? (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {dayStripEdges.right ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-300/80 bg-violet-100/90 px-2.5 py-1 text-[11px] font-semibold text-violet-950 shadow-sm">
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 motion-safe:animate-pulse" aria-hidden />
                      Hay más días a la derecha (desliza o usa las flechas)
                    </span>
                  ) : null}
                  {dayStripEdges.left ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                      <ChevronLeft className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      También hay días a la izquierda
                    </span>
                  ) : null}
                </div>
              ) : null}
              {itineraryDraft.days.length > 6 ? (
                <p className="mt-1.5 text-[11px] font-medium text-slate-500">
                  Total {itineraryDraft.days.length} días: usa la barra de desplazamiento inferior o las flechas laterales.
                </p>
              ) : null}
              <div className="relative mt-3 min-w-0">
                {dayStripEdges.left ? (
                  <div
                    className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 rounded-l-lg bg-gradient-to-r from-violet-50 via-violet-50/75 to-transparent sm:w-16"
                    aria-hidden
                  />
                ) : null}
                {dayStripEdges.right ? (
                  <div
                    className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 rounded-r-lg bg-gradient-to-l from-violet-50 via-violet-50/75 to-transparent sm:w-16"
                    aria-hidden
                  />
                ) : null}
                {dayStripEdges.left ? (
                  <button
                    type="button"
                    aria-label="Ver días anteriores"
                    onClick={() => scrollDayStrip("left")}
                    className="absolute left-1 top-1/2 z-20 -translate-y-1/2 rounded-full border border-violet-200/90 bg-white p-1.5 text-violet-800 shadow-md transition hover:bg-violet-50 sm:left-2 sm:p-2"
                  >
                    <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
                  </button>
                ) : null}
                {dayStripEdges.right ? (
                  <button
                    type="button"
                    aria-label="Ver más días"
                    onClick={() => scrollDayStrip("right")}
                    className="absolute right-1 top-1/2 z-20 -translate-y-1/2 rounded-full border border-violet-200/90 bg-white p-1.5 text-violet-800 shadow-md transition hover:bg-violet-50 sm:right-2 sm:p-2"
                  >
                    <ChevronRight className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
                  </button>
                ) : null}
                <div
                  ref={dayStripRef}
                  className="flex gap-2 overflow-x-auto overflow-y-visible py-1 pl-2 pr-2 pt-0.5 [scrollbar-color:rgba(139,92,246,0.45)_transparent] [scrollbar-width:thin] sm:snap-x sm:snap-mandatory sm:pl-10 sm:pr-10 [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-violet-300/80 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-violet-100/50"
                >
                  {itineraryDraft.days.map((d) => (
                    <button
                      key={d.day}
                      type="button"
                      onClick={() => setExpandedDay((prev) => (prev === d.day ? null : d.day))}
                      className={`min-w-[148px] shrink-0 snap-start rounded-xl border px-3 py-2 text-left text-xs transition sm:min-w-[160px] ${
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
                disabled={executingPlan || loading || (draftHasCalendarDates && tripPlanActivitiesLoading)}
                onClick={() => {
                  if (!itineraryDraft) return;
                  if (itineraryConflictDates.length) {
                    setPlanConflictOpen(true);
                    return;
                  }
                  void runExecutePlan("add");
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
              <div className="text-sm font-semibold text-slate-950">Cambios propuestos por el asistente personal</div>
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
                                  <pre className="mt-2 max-w-full overflow-x-auto break-all whitespace-pre-wrap text-xs text-slate-700">
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

      <section
        className={
          showConvSidebar
            ? "grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]"
            : layout === "drawer"
              ? "flex min-h-0 flex-1 flex-col gap-3 overflow-hidden"
              : "grid grid-cols-1 gap-3"
        }
      >
        {showConvSidebar ? (
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
                    {MODE_LABELS[item.mode as TripAiMode] || item.mode}
                  </div>
                </button>
              )) : (
                <p className="text-sm text-slate-500">Todavía no hay conversaciones guardadas.</p>
              )}
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
        ) : null}

        <section
          className={`chat-panel order-1 min-w-0 max-w-full rounded-[28px] border border-slate-200 bg-white shadow-sm xl:order-2 ${
            layout === "drawer" ? "flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-hidden" : "overflow-x-hidden"
          }`}
        >
          <div
            className={`border-b border-slate-200 px-4 py-3 sm:px-5 sm:py-4 ${
              layout === "drawer"
                ? "max-h-[min(34dvh,300px)] shrink-0 overflow-y-auto overscroll-y-contain"
                : ""
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-slate-950">Conversación</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Modo:{" "}
                  <span className="font-semibold text-slate-800">
                    {modeSource === "auto" ? "Automático" : activeMode?.label || MODE_LABELS[mode] || mode}
                  </span>
                  {modeSource === "manual" && activeMode ? (
                    <span className="mt-0.5 block text-xs text-slate-500 xl:hidden">{activeMode.useFor}</span>
                  ) : null}
                </p>
                <p className="mt-1 hidden text-xs text-slate-500 xl:block">
                  {modeSource === "auto"
                    ? "Modo automático: la intención se traduce en acción y resumen del viaje (sin enviar todo el historial)."
                    : "Modo manual: controlas el tipo de respuesta del asistente personal."}
                </p>
              </div>
              <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {loading ? "Pensando..." : "Listo"}
              </div>
            </div>

            <p className="mt-3 text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-500">Elige el foco</p>
            <div
              className={
                layout === "drawer"
                  ? "mt-2 grid grid-cols-2 gap-1.5 sm:gap-2 lg:grid-cols-4"
                  : "mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4"
              }
            >
              {ASSISTANT_FOCUS_PRESETS.map((preset) => {
                const selected = modeSource === "manual" && mode === preset.id;
                const Icon = preset.Icon;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={loading}
                    onClick={() => beginNewChatForMode(preset.id, { onlyIfChanged: true })}
                    className={`flex flex-col items-start gap-1 rounded-2xl border px-2.5 py-2 text-left transition disabled:opacity-50 sm:gap-1.5 sm:px-3 sm:py-2.5 ${
                      layout === "drawer" ? "min-h-[64px]" : "min-h-[88px]"
                    } ${
                      selected
                        ? "border-violet-400 bg-violet-50 text-violet-950 shadow-sm ring-1 ring-violet-200"
                        : "border-slate-200 bg-slate-50/80 text-slate-800 hover:border-slate-300 hover:bg-white"
                    }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${selected ? "text-violet-700" : "text-slate-500"}`} aria-hidden />
                    <span className="text-xs font-bold leading-tight">{preset.label}</span>
                    <span className="text-[10px] font-medium leading-snug text-slate-600">{preset.description}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              disabled={loading}
              onClick={() => beginNewChatForMode("auto", { onlyIfChanged: true })}
              className={`mt-2 w-full rounded-xl border px-3 py-2 text-xs font-semibold transition disabled:opacity-50 ${
                modeSource === "auto"
                  ? "border-cyan-400 bg-cyan-50 text-cyan-950 ring-1 ring-cyan-200"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              Automático (detectar intención del mensaje)
            </button>

            <details className="mt-3 rounded-xl border border-slate-100 bg-slate-50/90 px-3 py-2">
              <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                Lista completa de modos (incl. gastos, optimizador, acciones)
              </summary>
              <label className="mt-2 flex flex-col gap-1 text-[11px] font-semibold text-slate-600">
                Selector avanzado
                <select
                  value={modeSource === "manual" ? mode : "auto"}
                  onChange={(e) => {
                    const v = e.target.value as "auto" | TripAiMode;
                    if (v === "auto") {
                      beginNewChatForMode("auto", { onlyIfChanged: true });
                      return;
                    }
                    beginNewChatForMode(v, { onlyIfChanged: true });
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-800 shadow-sm"
                >
                  <option value="auto">Automático</option>
                  <option value="general">General</option>
                  <option value="planning">Planificación (planificador)</option>
                  <option value="day_planner">Organizar día (desplazamientos)</option>
                  <option value="travel_docs">Documentos del viaje</option>
                  <option value="expenses">Gastos</option>
                  <option value="optimizer">Optimizador</option>
                  <option value="actions">Acciones</option>
                </select>
              </label>
            </details>
          </div>

          {error ? (
            <div
              className={`mx-4 min-w-0 max-w-full break-words rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-5 ${
                layout === "drawer" ? "mt-2 shrink-0" : "mt-5"
              }`}
            >
              {error}
            </div>
          ) : null}

          {info ? (
            <div
              className={`mx-4 min-w-0 max-w-full break-words rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 sm:mx-5 ${
                layout === "drawer" ? "mt-2 shrink-0" : "mt-5"
              }`}
            >
              {info}
            </div>
          ) : null}

          <div
            className={
              layout === "drawer"
                ? "min-h-0 min-w-0 max-w-full flex-1 space-y-5 overflow-y-auto overflow-x-hidden overscroll-y-contain px-4 py-3 sm:px-5"
                : "max-h-[560px] min-w-0 max-w-full space-y-5 overflow-y-auto overflow-x-hidden px-4 py-5 sm:px-5"
            }
          >
            {messages.map((message) => {
              const travelDocs =
                message.role === "assistant" ? parseTravelDocsChecklistFromAnswer(message.content) : null;
              return (
                <div
                  key={message.id}
                  className={`flex w-full min-w-0 ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div className={`flex max-w-full flex-col gap-3 ${message.role === "user" ? "items-end" : "items-start"}`}>
                    <div
                      className={`max-w-[min(88%,100%)] min-w-0 break-words whitespace-pre-wrap rounded-[24px] px-4 py-3 text-sm leading-7 ${
                        message.role === "user"
                          ? "bg-slate-950 text-white"
                          : "border border-slate-200 bg-slate-50 text-slate-800"
                      }`}
                    >
                      {message.role === "assistant"
                        ? stripTripboardJsonBlocksForDisplay(message.content)
                        : message.content}
                    </div>
                    {travelDocs ? <TravelDocsChecklistCard tripId={tripId} payload={travelDocs} /> : null}
                  </div>
                </div>
              );
            })}

            {loading ? (
              <div className="flex justify-start">
                <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                  Generando respuesta…
                </div>
              </div>
            ) : null}

            <div ref={bottomRef} />
          </div>

          <div className={`min-w-0 max-w-full border-t border-slate-200 px-4 py-3 sm:px-5 ${layout === "drawer" ? "shrink-0" : ""}`}>
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

          <form
            onSubmit={handleSubmit}
            className={`min-w-0 max-w-full border-t border-slate-200 p-4 sm:p-5 ${layout === "drawer" ? "shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]" : ""}`}
          >
            <div className="min-w-0 max-w-full rounded-[24px] border border-slate-200 bg-slate-50 p-3">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                rows={layout === "drawer" ? 3 : 4}
                placeholder={placeholder}
                disabled={!isPremium}
                className={`w-full resize-none rounded-2xl border-0 bg-transparent px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 ${
                  layout === "drawer" ? "min-h-[72px]" : "min-h-[120px]"
                }`}
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
    </Root>
  );
}
