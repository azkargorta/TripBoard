"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, ChevronDown, ChevronRight, Compass, Plus, Sparkles, Trash2, X } from "lucide-react";
import type { TripCreationIntent } from "@/lib/trip-ai/tripCreationTypes";
import type { ExecutableItineraryPayload, ItineraryItemPayload } from "@/lib/trip-ai/tripCreationTypes";
import { daysBetweenInclusive, isIsoDate } from "@/lib/trip-ai/tripCreationDates";
import { DEFAULT_TRIP_AUTO_CONFIG, normalizeTripAutoConfig, type TripAutoConfig } from "@/lib/trip-ai/tripAutoConfig";
import PlanForm, { type PlanFormValues } from "@/components/trip/plan/PlanForm";

type Props = {
  isPremium: boolean;
  isAdmin?: boolean;
};

type WizardStep = 1 | 2 | 3;

type ApiNeedsClarification = {
  status: "needs_clarification";
  question: string;
  code: "destination" | "duration_or_dates";
  draftIntent: TripCreationIntent;
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

type ApiCreated = {
  status: "created" | "partial";
  tripId: string;
  error?: string;
};

type ApiError = { error: string; code?: string | null; budget?: any };

type PreviewPlansOk = {
  status: "ok";
  draftIntent: TripCreationIntent;
  resolved: { destination: string; startDate: string; endDate: string; durationDays: number; durationWarning?: string | null };
  itinerary: ExecutableItineraryPayload;
};

type LodgingSeg = {
  segmentKey: string;
  city: string;
  nights: number;
  dates: string[];
  startDate: string | null;
  endDate: string | null;
};

const STEP_LABELS: Array<{ step: WizardStep; label: string }> = [
  { step: 1, label: "Datos" },
  { step: 2, label: "Preferencias" },
  { step: 3, label: "Plan" },
];

const PROMPT_EXAMPLE =
  "Voy a realizar un viaje por Italia del 10 al 25 de agosto. Mi origen es Venecia desde Madrid en avión y mi destino es Roma y tengo vuelo final a Madrid. Quiero un viaje en familia, con museos y gastronómico.";

const TRIP_IDEAS = [
  "Con familia",
  "En pareja",
  "Con amigos",
  "Solo",
  "Gastronomía",
  "Cultura y museos",
  "Naturaleza",
  "Playa",
  "Aventura",
  "Relax",
  "Road trip",
  "Ciudad + pueblos",
  "Ruta optimizada",
  "Viaje barato",
  "Presupuesto medio",
  "Lujo",
  "Food tour",
  "Senderismo",
  "Compras",
  "Fiesta y noche",
  "Viaje con niños",
  "Sin madrugar",
  "Accesible (movilidad reducida)",
  "Pet-friendly",
] as const;

const INTEREST_TAGS = [
  "Gastronomía",
  "Cultura",
  "Museos",
  "Naturaleza",
  "Playas",
  "Senderismo",
  "Compras",
  "Fiesta/Noche",
  "Historia",
  "Arquitectura",
  "Arte",
  "Mercados",
  "Miradores",
  "Excursiones",
] as const;

const STYLE_TAGS = ["Tranquilo", "Equilibrado", "Intenso", "Road trip", "Ciudad + pueblos", "Relax", "Aventura"] as const;

function normalizeDestination(raw: string) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function inferPlacesPlaceholder(destinationRaw: string) {
  const d = normalizeDestination(destinationRaw);
  const has = (s: string) => d.includes(s);
  if (
    has("italia") ||
    has("italy") ||
    has("roma") ||
    has("rome") ||
    has("venecia") ||
    has("venice") ||
    has("florencia") ||
    has("florence")
  ) {
    return "Ej. Coliseo, Vaticano, Trastevere, Florencia, Murano…";
  }
  if (has("francia") || has("france") || has("paris") || has("parís")) {
    return "Ej. Louvre, Torre Eiffel, Montmartre, Versalles…";
  }
  if (
    has("japon") ||
    has("japón") ||
    has("japan") ||
    has("tokio") ||
    has("tokyo") ||
    has("kyoto") ||
    has("kioto") ||
    has("osaka")
  ) {
    return "Ej. Shibuya, Fushimi Inari, Arashiyama, Dotonbori…";
  }
  if (has("croacia") || has("croatia") || has("dubrovnik") || has("split")) {
    return "Ej. Dubrovnik, Split, Plitvice, Hvar…";
  }
  if (has("portugal") || has("lisboa") || has("lisbon") || has("oporto") || has("porto")) {
    return "Ej. Torre de Belém, Alfama, Ribeira, Livraria Lello…";
  }
  if (has("polonia") || has("poland") || has("cracovia") || has("krakow") || has("varsovia") || has("warsaw")) {
    return "Ej. Cracovia, Auschwitz, Barrio judío, Varsovia…";
  }
  if (has("espana") || has("españa") || has("spain") || has("madrid") || has("barcelona") || has("sevilla") || has("granada")) {
    return "Ej. Centro histórico, miradores, museos, tapas…";
  }
  return "Ej. Centro histórico, museo principal, mercado local…";
}

function inferPopularSuggestions(destinationRaw: string) {
  const d = normalizeDestination(destinationRaw);
  const has = (s: string) => d.includes(s);
  const uniq = (arr: string[]) => Array.from(new Set(arr.map((x) => String(x || "").trim()).filter(Boolean)));
  const generic = [
    "Casco histórico",
    "Barrio antiguo",
    "Pueblo medieval cercano",
    "Mirador / atardecer",
    "Mercado local",
    "Catedral / basílica",
    "Castillo / fortaleza",
    "Ruta de vinos",
    "Paseo por el río",
    "Playa / calas",
    "Museo principal",
    "Excursión de un día (pueblo con encanto)",
  ];

  // Destinos por país/región
  if (has("argentina")) {
    return uniq([
      "Buenos Aires",
      "Cataratas del Iguazú",
      "Puerto Iguazú",
      "Mendoza",
      "El Calafate",
      "Glaciar Perito Moreno",
      "Ushuaia",
      "Bariloche",
      "Salta",
      "Córdoba",
      "Mar del Plata",
    ]);
  }
  if (has("italia") || has("italy")) {
    return uniq([
      "Roma",
      "Florencia",
      "Venecia",
      "Milán",
      "Nápoles",
      "Bolonia",
      "Verona",
      "Lago Como",
      "Cinque Terre",
      "Pompeya",
      "Vaticano",
      "Trastevere",
      "Uffizi",
      "Duomo",
    ]);
  }
  if (has("francia") || has("france") || has("paris") || has("parís")) {
    return uniq([
      "París",
      "Louvre",
      "Torre Eiffel",
      "Montmartre",
      "Versalles",
      "Sena",
      "Museo d'Orsay",
      "Notre-Dame",
      "Le Marais",
      "Sainte-Chapelle",
    ]);
  }
  if (has("japon") || has("japón") || has("japan") || has("tokyo") || has("tokio") || has("kyoto") || has("kioto")) {
    return uniq([
      "Tokio",
      "Kioto",
      "Osaka",
      "Nara",
      "Shibuya",
      "Asakusa",
      "Fushimi Inari",
      "Arashiyama",
      "Dotonbori",
      "Castillo de Osaka",
    ]);
  }
  if (has("croacia") || has("croatia")) {
    // Solo ciudades/pueblos (sin atracciones/parques) para que al añadir etiquetas no “contamine” el orden de pernocta.
    return uniq(["Zagreb", "Dubrovnik", "Split", "Zadar", "Šibenik", "Trogir", "Pula", "Rovinj", "Korčula", "Hvar"]);
  }
  if (has("portugal")) {
    return uniq(["Lisboa", "Oporto", "Sintra", "Belém", "Ribeira", "Cascais", "Braga", "Coímbra", "Alfama"]);
  }
  if (has("polonia") || has("poland")) {
    return uniq(["Cracovia", "Auschwitz", "Gdansk", "Varsovia", "Wroclaw", "Zakopane", "Barrio judío"]);
  }

  // Destinos por ciudad (España)
  if (has("madrid")) {
    return uniq(["Madrid", "Museo del Prado", "Reina Sofía", "Parque del Retiro", "Gran Vía", "Malasaña", "Lavapiés", "Toledo", "Segovia"]);
  }
  if (has("barcelona")) {
    return uniq([
      "Barcelona",
      "Sagrada Familia",
      "Park Güell",
      "Gótico",
      "El Born",
      "Montjuïc",
      "Casa Batlló",
      "Montserrat",
      "Sitges",
    ]);
  }
  if (has("sevilla") || has("seville")) {
    return uniq(["Sevilla", "Real Alcázar", "Catedral", "Triana", "Plaza de España", "Barrio Santa Cruz", "Córdoba (excursión)"]);
  }
  if (has("granada")) {
    return uniq(["Granada", "Alhambra", "Albaicín", "Mirador de San Nicolás", "Sierra Nevada", "Tapas por el centro"]);
  }

  // Fallback: mezcla destino + conceptos genéricos
  const base =
    destinationRaw && String(destinationRaw).trim()
      ? [`Centro histórico de ${String(destinationRaw).trim()}`, `Miradores en ${String(destinationRaw).trim()}`]
      : [];
  return uniq([...base, ...generic]);
}

// Nota: la pestaña "Explorar mapa" del asistente automático está desactivada por ahora.

function cityFromAddress(addressRaw: string) {
  const raw = String(addressRaw || "").trim();
  if (!raw) return "";
  // Normalmente: "Lugar, Calle, Ciudad, País" o "Ciudad, País"
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    // Heurística: si hay 3+ partes, la "ciudad" suele estar al final-1.
    if (parts.length >= 3) return String(parts[parts.length - 2] || parts[0] || "").replace(/^\d+\s+/, "");
    // 2 partes: "Ciudad, País"
    return String(parts[0] || "").replace(/^\d+\s+/, "");
  }
  return raw.replace(/^\d+\s+/, "");
}

function clampStep(n: number): WizardStep {
  if (n <= 1) return 1;
  if (n >= 3) return 3;
  return 2;
}

function stepTitle(step: WizardStep) {
  return STEP_LABELS.find((s) => s.step === step)?.label ?? "Viaje";
}

function placesFromIntent(intent: TripCreationIntent | null): string[] {
  const list = (intent?.mustSee || []).map((x) => String(x || "").trim()).filter(Boolean);
  return [...new Set(list)].slice(0, 24);
}

function normalizePlaces(raw: string[]) {
  return raw.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 24);
}

function buildWizardFollowUp(params: {
  intent: TripCreationIntent | null;
  transportNotes: string;
  travelersType: string;
  travelersCount: number | null;
  travelerNames: string[];
}) {
  const parts: string[] = [];
  const i = params.intent;
  if (i?.startLocation) parts.push(`Empiezo en: ${i.startLocation}.`);
  if (i?.endLocation) parts.push(`Termino en: ${i.endLocation}.`);
  if (Array.isArray(i?.mustSee) && i!.mustSee!.length) parts.push(`Sitios a visitar: ${i!.mustSee!.join(", ")}.`);
  if (typeof i?.wantsRouteOptimization === "boolean") {
    parts.push(`Optimizar orden: ${i.wantsRouteOptimization ? "sí" : "no"}.`);
  }
  if (params.transportNotes.trim()) {
    parts.push(`Preferencias de transporte/rutas: ${params.transportNotes.trim()}`);
  }
  if (params.travelersType) parts.push(`Tipo de viajeros: ${params.travelersType}.`);
  if (typeof params.travelersCount === "number" && params.travelersCount > 0) parts.push(`Número de viajeros: ${params.travelersCount}.`);
  if (params.travelerNames.length) parts.push(`Nombres: ${params.travelerNames.join(", ")}.`);
  return parts.join(" ");
}

async function callAutoCreate(params: {
  prompt?: string;
  followUp?: string;
  draftIntent?: TripCreationIntent | null;
  previewOnly: boolean;
  config?: TripAutoConfig | null;
  /** Si viene del paso Planes (previsualización), se reutiliza orden/contenido y se evita otra llamada IA al crear. */
  itinerary?: ExecutableItineraryPayload | null;
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
      config: params.config ? normalizeTripAutoConfig(params.config) : undefined,
      ...(params.itinerary && params.itinerary.days?.length ? { itinerary: params.itinerary } : {}),
    }),
  });

  const rawText = await res.text().catch(() => "");
  const data = ((): any => {
    try {
      return rawText ? JSON.parse(rawText) : null;
    } catch {
      return null;
    }
  })() as (ApiNeedsClarification | ApiReady | ApiCreated | ApiError | null) & any;

  if (!res.ok) {
    const code = typeof data?.code === "string" ? data.code : null;
    const serverMsg = typeof data?.error === "string" ? data.error : "";
    const msg =
      serverMsg ||
      (rawText && rawText.length < 400 ? rawText : "") ||
      `No se pudo continuar con el asistente (HTTP ${res.status}).`;
    const err = new Error(msg) as Error & { code?: string | null; budget?: any; httpStatus?: number };
    err.code = code;
    err.budget = data?.budget;
    err.httpStatus = res.status;
    throw err;
  }

  return data;
}

function Stepper({ activeStep }: { activeStep: WizardStep }) {
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs font-extrabold">
      {STEP_LABELS.map((s, idx) => {
        const active = s.step === activeStep;
        const done = s.step < activeStep;
        return (
          <li key={s.step} className="flex items-center gap-2">
            <span
              className={`inline-flex h-7 items-center justify-center rounded-full border px-3 ${
                active
                  ? "border-violet-300 bg-violet-50 text-violet-950"
                  : done
                    ? "border-emerald-200 bg-emerald-50 text-emerald-950"
                    : "border-slate-200 bg-white text-slate-700"
              }`}
            >
              {idx + 1}. {s.label}
            </span>
            {idx < STEP_LABELS.length - 1 ? <ChevronRight className="h-4 w-4 text-slate-300" aria-hidden /> : null}
          </li>
        );
      })}
    </ol>
  );
}

export default function TripCreationWizard({ isPremium }: Props) {
  const router = useRouter();
  const topRef = useRef<HTMLDivElement | null>(null);

  const [step, setStep] = useState<WizardStep>(1);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [prompt, setPrompt] = useState("");
  const [tripIdeas, setTripIdeas] = useState<Set<string>>(() => new Set());
  const [stage, setStage] = useState<"idle" | "clarifying" | "ready">("idle");
  const [question, setQuestion] = useState<string | null>(null);
  const [followUp, setFollowUp] = useState("");

  const [draftIntent, setDraftIntent] = useState<TripCreationIntent | null>(null);
  const [destinations, setDestinations] = useState<string[]>([]);
  const [destinationAdd, setDestinationAdd] = useState("");
  const [places, setPlaces] = useState<string[]>([]);
  const [placeAdd, setPlaceAdd] = useState("");
  const [optimizeOrder, setOptimizeOrder] = useState(true);
  const [optimizeTouched, setOptimizeTouched] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewItinerary, setPreviewItinerary] = useState<ExecutableItineraryPayload | null>(null);
  const [previewResolved, setPreviewResolved] = useState<PreviewPlansOk["resolved"] | null>(null);
  const [previewFast, setPreviewFast] = useState(false);
  const [previewStructure, setPreviewStructure] = useState<any | null>(null);
  const [previewMemory, setPreviewMemory] = useState<{
    itinerary: ExecutableItineraryPayload;
    resolved: PreviewPlansOk["resolved"] | null;
    key: string;
  } | null>(null);
  const [planChangeNotes, setPlanChangeNotes] = useState("");
  // (Mapa desactivado por ahora)
  const [previewExpandedDays, setPreviewExpandedDays] = useState<Set<number>>(() => new Set());
  const [previewEditor, setPreviewEditor] = useState<
    | null
    | {
        mode: "add" | "edit";
        dayIndex: number;
        itemIndex: number | null;
        date: string | null;
        initialData: {
          id?: string;
          title?: string | null;
          description?: string | null;
          rating?: number | null;
          comment?: string | null;
          activity_date?: string | null;
          activity_time?: string | null;
          place_name?: string | null;
          address?: string | null;
          latitude?: number | null;
          longitude?: number | null;
          activity_kind?: string | null;
        } | null;
      }
  >(null);
  const [previewEditorSaving, setPreviewEditorSaving] = useState(false);
  const [previewEditorError, setPreviewEditorError] = useState<string | null>(null);
  const [previewRefineLoading, setPreviewRefineLoading] = useState(false);
  const [previewRefineError, setPreviewRefineError] = useState<string | null>(null);

  const [lodgingLoading, setLodgingLoading] = useState(false);
  const [lodgingError, setLodgingError] = useState<string | null>(null);
  const [lodgingItinerary, setLodgingItinerary] = useState<ExecutableItineraryPayload | null>(null);
  const [lodgingResolved, setLodgingResolved] = useState<PreviewPlansOk["resolved"] | null>(null);
  const [lodgingActionBySegment, setLodgingActionBySegment] = useState<Record<string, "none" | "manual" | "scan" | "proposal">>({});
  const [lodgingManualBySegment, setLodgingManualBySegment] = useState<Record<string, { name: string; address: string; notes: string }>>({});
  const [lodgingProposalTierBySegment, setLodgingProposalTierBySegment] = useState<Record<string, "asequible" | "medio" | "lujo">>({});
  const [lodgingSelectedHotelBySegment, setLodgingSelectedHotelBySegment] = useState<
    Record<string, { name: string; priceLabel: string; url: string } | null>
  >({});
  const [lodgingOpenSegment, setLodgingOpenSegment] = useState<string | null>(null);
  const [lodgingScanLoadingBySegment, setLodgingScanLoadingBySegment] = useState<Record<string, boolean>>({});
  const [lodgingScanErrorBySegment, setLodgingScanErrorBySegment] = useState<Record<string, string>>({});

  const [transportNotes, setTransportNotes] = useState("");
  const [travelersType, setTravelersType] = useState<string>("family");
  const [travelersCount, setTravelersCount] = useState<number | null>(null);
  const [travelerNamesText, setTravelerNamesText] = useState("");
  const [createdTripId, setCreatedTripId] = useState<string | null>(null);
  const [createdTripPartialError, setCreatedTripPartialError] = useState<string | null>(null);
  const [creatingTripSilently, setCreatingTripSilently] = useState(false);
  const [autoConfig, setAutoConfig] = useState<TripAutoConfig>(() => DEFAULT_TRIP_AUTO_CONFIG);

  const [mobilityWalkLimitMin, setMobilityWalkLimitMin] = useState<number>(45);
  const [mobilityCityLongMode, setMobilityCityLongMode] = useState<"public_transport" | "taxi" | "driving">("public_transport");
  const [mobilityIntercityPreference, setMobilityIntercityPreference] = useState<"best" | "train_first" | "flight_first" | "bus_first">("best");

  const mobilityRulesText = useMemo(() => {
    const walk = Math.max(10, Math.min(120, Math.round(mobilityWalkLimitMin || 45)));
    const cityMode =
      mobilityCityLongMode === "public_transport"
        ? "transporte público"
        : mobilityCityLongMode === "taxi"
          ? "taxi"
          : "coche";
    const intercity =
      mobilityIntercityPreference === "train_first"
        ? "Entre ciudades: prioriza tren; si no es viable, autobús; y si es muy largo, vuelo."
        : mobilityIntercityPreference === "flight_first"
          ? "Entre ciudades: prioriza vuelo si reduce mucho el tiempo total; si no, tren; y si no, autobús."
          : mobilityIntercityPreference === "bus_first"
            ? "Entre ciudades: prioriza autobús (coste/experiencia) salvo que sea excesivo; si no, tren; y si no, vuelo."
            : "Entre ciudades: elige la mejor opción entre vuelo, autobús y tren según duración total, fiabilidad y número de transbordos.";
    return [
      `Dentro de ciudad: andando si son <= ${walk} minutos; si es más, usa ${cityMode}.`,
      intercity,
    ].join("\n");
  }, [mobilityWalkLimitMin, mobilityCityLongMode, mobilityIntercityPreference]);

  useEffect(() => {
    // Si el usuario no ha escrito notas manuales, generamos una base automática.
    setAutoConfig((p) => {
      const cur = String(p?.transport?.notes || "");
      if (cur.trim()) return p;
      return { ...p, transport: { ...p.transport, notes: mobilityRulesText } };
    });
  }, [mobilityRulesText]);

  const creatingOverlay = loading || creatingTripSilently;

  // Destinos múltiples:
  // - El primero es el "Destino principal" (se guarda en intent.destination).
  // - El resto se añaden a mustSee para que entren en la estructura/plan.
  useEffect(() => {
    const raw = String(draftIntent?.destination || "").trim();
    if (!raw) return;
    if (destinations.length) return;
    const initial = raw
      .split(/[,;\n\r]+/g)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 10);
    if (initial.length) setDestinations(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftIntent?.destination]);

  useEffect(() => {
    if (!destinations.length) return;
    setDraftIntent((prev) => {
      const primary = destinations[0] || null;
      const extras = destinations.slice(1);
      const existing = Array.isArray(prev?.mustSee) ? prev!.mustSee!.map((x) => String(x || "").trim()).filter(Boolean) : [];
      const mergedMustSee = normalizePlaces([...extras, ...existing]);
      return { ...(prev || {}), destination: primary, mustSee: mergedMustSee };
    });
  }, [destinations]);

  function addDestinationTag(raw: string) {
    const v = String(raw || "").trim();
    if (!v) return;
    setDestinations((prev) => {
      const next = normalizePlaces([...prev, v]).slice(0, 10);
      return next;
    });
    setDestinationAdd("");
  }

  function removeDestinationTag(tag: string) {
    setDestinations((prev) => prev.filter((x) => x !== tag));
    // Si quitan todos, limpiamos destination para no bloquear canContinue.
    setDraftIntent((prev) => {
      const nextDest = destinations.filter((x) => x !== tag);
      if (!nextDest.length) return { ...(prev || {}), destination: null };
      return prev || null;
    });
  }

  function makePrimaryDestination(tag: string) {
    setDestinations((prev) => {
      if (!prev.includes(tag)) return prev;
      return [tag, ...prev.filter((x) => x !== tag)];
    });
  }

  function lodgingSearchBaseLabel() {
    const base = String(autoConfig?.lodging?.baseCity || "").trim();
    if (autoConfig?.lodging?.baseCityMode === "single" && base) return base;
    return String(destinationLabel || "").trim() || String(draftIntent?.destination || "").trim() || "Destino";
  }

  function bookingHotelsUrl(params: { city: string; checkin: string | null; checkout: string | null }) {
    const ss = encodeURIComponent(params.city.trim());
    const qs = new URLSearchParams({ ss });
    if (params.checkin) qs.set("checkin", params.checkin);
    if (params.checkout) qs.set("checkout", params.checkout);
    return `https://www.booking.com/searchresults.html?${qs.toString()}`;
  }

  async function scanLodgingDocumentForSegment(params: { segmentKey: string; file: File }) {
    const { segmentKey, file } = params;
    setLodgingScanErrorBySegment((p) => ({ ...p, [segmentKey]: "" }));
    setLodgingScanLoadingBySegment((p) => ({ ...p, [segmentKey]: true }));
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("enhance", "1");
      const resp = await fetch("/api/document/analyze", { method: "POST", body: fd });
      const payload = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(payload?.error || `Error ${resp.status}`);

      const llm = payload?.llmDetected || payload?.detected || null;
      const name = String(llm?.reservationName || llm?.providerName || "").trim();
      const addressParts = [llm?.address, llm?.city, llm?.country].filter((x: any) => typeof x === "string" && x.trim());
      const address = String(addressParts.join(", ")).trim();
      const code = typeof llm?.reservationCode === "string" ? llm.reservationCode.trim() : "";
      const dates = [llm?.checkInDate, llm?.checkOutDate].filter((x: any) => typeof x === "string" && x.trim()).join(" → ");
      const notesParts = [
        code ? `Código: ${code}` : "",
        dates ? `Fechas: ${dates}` : "",
        typeof llm?.totalAmount === "string" || typeof llm?.totalAmount === "number"
          ? `Total: ${String(llm.totalAmount)}${typeof llm?.currency === "string" && llm.currency ? ` ${llm.currency}` : ""}`
          : "",
      ].filter(Boolean);

      setLodgingManualBySegment((p) => ({
        ...p,
        [segmentKey]: {
          name: name || (p[segmentKey]?.name || ""),
          address: address || (p[segmentKey]?.address || ""),
          notes: notesParts.length ? notesParts.join("\n") : (p[segmentKey]?.notes || ""),
        },
      }));
      setLodgingActionBySegment((p) => ({ ...p, [segmentKey]: "scan" }));
      setLodgingOpenSegment(segmentKey);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo escanear el documento.";
      setLodgingScanErrorBySegment((p) => ({ ...p, [segmentKey]: msg }));
    } finally {
      setLodgingScanLoadingBySegment((p) => ({ ...p, [segmentKey]: false }));
    }
  }

  function googleHotelsUrl(params: { city: string; checkin: string | null; checkout: string | null }) {
    const parts = [`hotels in ${params.city}`];
    if (params.checkin && params.checkout) parts.push(`${params.checkin} to ${params.checkout}`);
    const q = encodeURIComponent(parts.join(" "));
    return `https://www.google.com/search?q=${q}`;
  }

  function syncDurationFromDates(next: TripCreationIntent): TripCreationIntent {
    const s = isIsoDate(next.startDate) ? next.startDate : null;
    const e = isIsoDate(next.endDate) ? next.endDate : null;
    if (s && e && e >= s) {
      return { ...next, durationDays: daysBetweenInclusive(s, e) };
    }
    return next;
  }

  const travelerNames = useMemo(
    () =>
      travelerNamesText
        .split(/[,;\n\r]+/g)
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 20),
    [travelerNamesText]
  );

  const canContinue = useMemo(() => {
    if (loading) return false;
    if (step === 1) {
      const dest = String(draftIntent?.destination || draftIntent?.endLocation || "").trim();
      const s = isIsoDate(draftIntent?.startDate) ? draftIntent?.startDate : null;
      const e = isIsoDate(draftIntent?.endDate) ? draftIntent?.endDate : null;
      const hasDates = Boolean(s && e && e >= s);
      const hasDuration = typeof draftIntent?.durationDays === "number" && draftIntent.durationDays >= 1;
      return Boolean(dest) && (hasDates || hasDuration);
    }
    if (step === 2) return Boolean(draftIntent);
    if (step === 3) return Boolean(draftIntent);
    return true;
  }, [draftIntent, loading, step]);

  const derivedPlaces = useMemo(() => {
    if (places.length) return places;
    return placesFromIntent(draftIntent);
  }, [draftIntent, places]);

  const destinationLabel = useMemo(() => {
    const a = String(draftIntent?.destination || "").trim();
    const b = String(draftIntent?.endLocation || "").trim();
    return a || b || "";
  }, [draftIntent?.destination, draftIntent?.endLocation]);

  const placesPlaceholder = useMemo(() => inferPlacesPlaceholder(destinationLabel), [destinationLabel]);
  const popularSuggestions = useMemo(() => inferPopularSuggestions(destinationLabel), [destinationLabel]);
  const [popularSuggestionsOpen, setPopularSuggestionsOpen] = useState(false);

  const promptForAi = useMemo(() => {
    const base = prompt.trim();
    if (!tripIdeas.size) return base;
    const extras = Array.from(tripIdeas.values());
    // Lo añadimos como una línea extra para dar contexto sin “ensuciar” el texto original.
    return base ? `${base}\n\nIdeas/estilo: ${extras.join(" · ")}` : `Ideas/estilo: ${extras.join(" · ")}`;
  }, [prompt, tripIdeas]);

  const intentInterests = useMemo(() => normalizePlaces((draftIntent?.interests || []) as any), [draftIntent?.interests]);
  const intentStyles = useMemo(() => normalizePlaces((draftIntent?.travelStyle || []) as any), [draftIntent?.travelStyle]);

  function toggleIntentTag(field: "interests" | "travelStyle", tag: string) {
    const t = String(tag || "").trim();
    if (!t) return;
    setDraftIntent((prev) => {
      const cur = (prev?.[field] as any) as string[] | undefined;
      const list = Array.isArray(cur) ? cur.map((x) => String(x || "").trim()).filter(Boolean) : [];
      const next = list.includes(t) ? list.filter((x) => x !== t) : [...list, t];
      return { ...(prev || {}), [field]: next.slice(0, 20) } as any;
    });
  }

  useEffect(() => {
    if (step < 2) return;
    if (!draftIntent) return;
    // Asegura que "Optimizar orden" esté activado por defecto (si el usuario no lo ha tocado).
    if (!optimizeTouched) {
      setOptimizeOrder(true);
      setDraftIntent((prev) => ({ ...(prev || {}), wantsRouteOptimization: true }));
    }
  }, [draftIntent, optimizeTouched, step]);

  async function ensureLodgingItinerary() {
    if (!draftIntent || lodgingLoading) return;
    if (autoConfig.lodging.mode !== "proposal") return;
    if (lodgingItinerary && lodgingResolved) return;
    // Si ya hemos previsualizado planes en el paso anterior, reutilizamos ese itinerary para evitar otra llamada a la IA.
    if (previewItinerary?.days?.length && previewResolved) {
      setLodgingResolved(previewResolved);
      setLodgingItinerary(previewItinerary);
      return;
    }
    setLodgingLoading(true);
    setLodgingError(null);
    try {
      const res = await fetch("/api/trips/auto-preview-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "gemini",
          draftIntent: { ...draftIntent, mustSee: derivedPlaces, wantsRouteOptimization: optimizeOrder },
          config: normalizeTripAutoConfig(autoConfig),
        }),
      });
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "No se pudieron calcular alojamientos.");
      if (data?.status !== "ok" || !data?.itinerary) throw new Error("Respuesta inesperada del servidor.");
      setLodgingResolved(data.resolved || null);
      setLodgingItinerary(data.itinerary || null);
    } catch (e) {
      setLodgingError(e instanceof Error ? e.message : "No se pudieron calcular alojamientos.");
      setLodgingResolved(null);
      setLodgingItinerary(null);
    } finally {
      setLodgingLoading(false);
    }
  }

  useEffect(() => {
    // El flujo “rápido” ya no obliga a pasar por alojamientos: se calcularán solo si el usuario previsualiza planes.
    // (Se reutiliza previewItinerary cuando exista).
    return;
  }, []);

  const lodgingCities = useMemo<LodgingSeg[]>(() => {
    if (previewStructure && Array.isArray((previewStructure as any)?.segments) && (previewStructure as any).segments.length) {
      return (previewStructure as any).segments as LodgingSeg[];
    }
    const itin = lodgingItinerary || previewItinerary;
    if (!itin?.days?.length) return [];

    const normCity = (raw: string) => {
      const s = String(raw || "").trim();
      if (!s) return "";
      return s
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\bisla\b|\bisland\b|\bprovince\b|\bregion\b/gi, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
    };

    const addDays = (isoDate: string, days: number) => {
      const d = new Date(`${isoDate}T12:00:00`);
      if (Number.isNaN(d.getTime())) return isoDate;
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    };

    const sortedDays = [...itin.days]
      .filter((d) => typeof d?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.date))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));

    // 1) Derivamos una ciudad "de alojamiento" por día.
    // 2) Suavizamos cambios de 1 solo día sin check-in explícito (típico de excursiones).
    const dayRows = sortedDays.map((day) => {
      const items = day.items || [];
      const lodgingItem =
        items.find((it) => String(it.activity_kind || "").toLowerCase() === "lodging") ||
        items.find((it) => /check[-\s]?in|hotel|aloj/i.test(String(it.title || ""))) ||
        null;
      const hasExplicit = Boolean(lodgingItem);
      const addr = String(lodgingItem?.address || "").trim();
      const inferred =
        cityFromAddress(addr) || cityFromAddress(String(items[items.length - 1]?.address || "")) || "Sin ciudad";
      return { day, city: inferred, hasExplicit };
    });

    for (let i = 1; i < dayRows.length - 1; i++) {
      const prev = dayRows[i - 1]!;
      const cur = dayRows[i]!;
      const next = dayRows[i + 1]!;
      if (cur.hasExplicit) continue;
      const p = normCity(prev.city);
      const c = normCity(cur.city);
      const n = normCity(next.city);
      if (p && n && p === n && c && c !== p) {
        // Patrón A-B-A sin check-in: asumimos que B era una excursión y no un cambio de alojamiento.
        dayRows[i] = { ...cur, city: prev.city };
      }
    }

    const segments: LodgingSeg[] = [];
    let current: LodgingSeg | null = null;

    for (const row of dayRows) {
      const day = row.day;
      const city = row.city;

      // Tramos consecutivos por ciudad: si vuelves a la misma ciudad más tarde en el viaje, es otro tramo (otro check-in).
      if (!current || normCity(current.city) !== normCity(city)) {
        if (current) segments.push(current);
        const startDate = typeof day.date === "string" ? day.date : null;
        const segOrdinal: number = segments.length;
        const sk: string = `${city}|${startDate || "unknown"}|${String(segOrdinal)}`;
        current = {
          segmentKey: sk,
          city,
          nights: 0,
          dates: [],
          startDate,
          endDate: null,
        };
      }

      current.nights += 1;
      if (day.date) {
        current.dates.push(day.date);
        const sortedDates = [...current.dates].sort((a, b) => a.localeCompare(b));
        current.startDate = sortedDates[0] || null;
        const last = sortedDates[sortedDates.length - 1] || null;
        current.endDate = last ? addDays(last, 1) : null;
      }
    }
    if (current) segments.push(current);

    return segments.sort((a, b) => {
      const ad = a.startDate || "9999-12-31";
      const bd = b.startDate || "9999-12-31";
      const byDate = ad.localeCompare(bd);
      if (byDate !== 0) return byDate;
      return b.nights - a.nights;
    });
  }, [lodgingItinerary, previewItinerary, previewStructure]);

  function hotelOptionsFor(city: string, tier: "asequible" | "medio" | "lujo", resolvedLabel: string) {
    const base = encodeURIComponent(`${city} hotel ${resolvedLabel}`.trim());
    const mk = (name: string, priceLabel: string) => ({
      name,
      priceLabel,
      url: `https://www.google.com/search?q=${encodeURIComponent(`${name} ${city} hotel`)}`,
    });
    if (tier === "asequible") {
      return [
        mk(`${city} Budget Inn`, "€"),
        mk(`${city} City Hostel`, "€"),
        mk(`${city} Central Rooms`, "€€"),
      ];
    }
    if (tier === "lujo") {
      return [
        mk(`${city} Grand Hotel`, "€€€"),
        mk(`${city} Boutique Palace`, "€€€"),
        mk(`${city} Luxury Suites`, "€€€"),
      ];
    }
    return [
      mk(`${city} Central Hotel`, "€€"),
      mk(`${city} Riverside Hotel`, "€€"),
      mk(`${city} Boutique Stay`, "€€"),
    ];
  }

  function scrollTop() {
    window.requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function goBack() {
    if (loading) return;
    if (step === 1) {
      router.push("/dashboard");
      return;
    }
    setError(null);
    setStep((s) => clampStep(s - 1));
    scrollTop();
  }

  function goNext() {
    if (!canContinue) return;
    setError(null);
    setStep((s) => clampStep(s + 1));
    scrollTop();
  }

  function addPlaceTag(raw: string) {
    const v = String(raw || "").trim();
    if (!v) return;
    setPlaces((prev) => normalizePlaces([...prev, v]));
    setPlaceAdd("");
    setDraftIntent((prev) => ({ ...(prev || {}), mustSee: normalizePlaces([...(prev?.mustSee || []), v]) }));
  }

  function removePlaceTag(tag: string) {
    setPlaces((prev) => prev.filter((x) => x !== tag));
    setDraftIntent((prev) => ({
      ...(prev || {}),
      mustSee: (prev?.mustSee || []).filter((x) => String(x || "").trim() !== tag),
    }));
  }

  async function step1Preview() {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const data = await callAutoCreate({
        prompt: promptForAi,
        draftIntent: { ...(draftIntent || {}), wantsRouteOptimization: optimizeOrder },
        previewOnly: true,
        config: autoConfig,
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
        setOptimizeOrder(Boolean(ready.draftIntent?.wantsRouteOptimization ?? true));
        setStage("ready");
        setQuestion(null);
        setFollowUp("");
        setPlaces(placesFromIntent(ready.draftIntent || null));
        setStep(2);
        scrollTop();
        // Auto-abre la previsualización en cuanto tengamos el borrador listo.
        void previewPlans();
        return;
      }
      throw new Error("Respuesta inesperada del servidor.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo interpretar tu viaje.");
    } finally {
      setLoading(false);
    }
  }

  async function step1Clarify() {
    if (!followUp.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const data = await callAutoCreate({
        followUp: followUp.trim(),
        draftIntent: { ...(draftIntent || {}), wantsRouteOptimization: optimizeOrder },
        previewOnly: true,
        config: autoConfig,
      });
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
        setOptimizeOrder(Boolean(ready.draftIntent?.wantsRouteOptimization ?? true));
        setStage("ready");
        setQuestion(null);
        setFollowUp("");
        setPlaces(placesFromIntent(ready.draftIntent || null));
        setStep(2);
        scrollTop();
        void previewPlans();
        return;
      }
      throw new Error("Respuesta inesperada del servidor.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo continuar.");
    } finally {
      setLoading(false);
    }
  }

  async function finalizeCreateTrip(options?: { redirectTo?: "participants" | "summary" | "none"; silent?: boolean }) {
    if ((loading || creatingTripSilently) || !draftIntent) {
      // Evita “click muerto” si hay creación silenciosa en curso.
      if (!loading && creatingTripSilently) setError("Ya hay una creación de viaje en curso. Espera unos segundos e inténtalo de nuevo.");
      return null;
    }
    const silent = Boolean(options?.silent);
    if (silent) setCreatingTripSilently(true);
    else setLoading(true);
    if (!silent) setError(null);
    try {
      const mergedFollowUp = buildWizardFollowUp({
        intent: { ...draftIntent, mustSee: derivedPlaces, wantsRouteOptimization: optimizeOrder },
        transportNotes,
        travelersType,
        travelersCount,
        travelerNames,
      });
      const mergedFollowUpWithNotes = `${mergedFollowUp}${planChangeNotes.trim() ? `\n\nCambios solicitados para el plan: ${planChangeNotes.trim()}` : ""}`;
      // Si ya tenemos un itinerario previsualizado, NO re-ejecutamos la “fusión” de intent con IA al crear:
      // reutilizamos el itinerario para evitar que una nota de cambios provoque un needs_clarification inesperado.
      const followUpForCreate = previewItinerary?.days?.length ? "" : mergedFollowUpWithNotes;

      const data = await callAutoCreate({
        followUp: followUpForCreate,
        draftIntent: { ...draftIntent, mustSee: derivedPlaces, wantsRouteOptimization: optimizeOrder },
        previewOnly: false,
        itinerary: previewItinerary,
        config: autoConfig,
      });

      if (data?.status === "created" || data?.status === "partial") {
        const created = data as ApiCreated;
        if (created.status === "partial" && created.error) {
          setCreatedTripPartialError(created.error);
        } else {
          setCreatedTripPartialError(null);
        }
        setCreatedTripId(created.tripId);

        // Redirige cuanto antes para no “bloquear” la UX con tareas extra (geocoding / reservas).
        // El resto de guardados se pueden hacer en segundo plano.
        const redirectTo = options?.redirectTo ?? "participants";
        if (redirectTo === "summary") {
          router.push(`/trip/${encodeURIComponent(created.tripId)}/summary?recien=1`);
        } else if (redirectTo === "participants") {
          router.push(`/trip/${encodeURIComponent(created.tripId)}/participants?recien=1`);
        }

        // Guardar alojamientos elegidos en el wizard como actividades "lodging" en BD.
        // (Antes se quedaban solo en estado local y se perdían al crear el viaje).
        if (!silent && lodgingCities.length) {
          void (async () => {
            const sortedLodging = [...lodgingCities].sort((a, b) => {
              const ad = a.startDate || "";
              const bd = b.startDate || "";
              if (ad !== bd) return ad.localeCompare(bd);
              return a.segmentKey.localeCompare(b.segmentKey);
            });
            for (let li = 0; li < sortedLodging.length; li++) {
              const row = sortedLodging[li]!;
              const city = row.city;
              const segmentKey = row.segmentKey;
              const selected = lodgingSelectedHotelBySegment[segmentKey] ?? null;
              const manual = lodgingManualBySegment[segmentKey] || { name: "", address: "", notes: "" };
              const name = String(selected?.name || manual.name || "").trim();
              const address = String(manual.address || "").trim();
              if (!name) continue;

              const query = [address, city, destinationLabel].filter(Boolean).join(", ");
              let latitude: number | null = null;
              let longitude: number | null = null;
              let formattedAddress: string | null = address || null;

              if (query) {
                const resp = await fetch("/api/geocode", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ address: query, tripId: created.tripId }),
                });
                const payload = await resp.json().catch(() => null);
                if (resp.ok) {
                  latitude = typeof payload?.latitude === "number" ? payload.latitude : null;
                  longitude = typeof payload?.longitude === "number" ? payload.longitude : null;
                  formattedAddress = typeof payload?.formattedAddress === "string" ? payload.formattedAddress : formattedAddress;
                }
              }

              const baseMin = 12 * 60 + 20;
              const m = baseMin + li * 4;
              const hh = Math.floor(m / 60);
              const mm = m % 60;
              const activity_time = `${String(Math.min(23, hh)).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;

              const notesParts: string[] = [];
              if (selected?.url) notesParts.push(`Web: ${selected.url}`);
              if (manual.notes?.trim()) notesParts.push(manual.notes.trim());
              const notes = notesParts.length ? notesParts.join("\n\n") : null;

              const destParts = destinationLabel
                .split(/[,|;]+/g)
                .map((s) => s.trim())
                .filter(Boolean);
              const countryHint = destParts.length > 1 ? destParts[destParts.length - 1]! : destParts[0] || null;

              await fetch("/api/trip-reservations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  tripId: created.tripId,
                  reservation_type: "lodging",
                  reservation_name: name,
                  reservation_code: null,
                  address: formattedAddress,
                  city: city && city !== "Sin ciudad" ? city : null,
                  country: countryHint,
                  check_in_date: row.startDate || draftIntent?.startDate || null,
                  check_in_time: activity_time,
                  check_out_date: row.endDate || null,
                  check_out_time: null,
                  guests: null,
                  total_amount: null,
                  currency: "EUR",
                  payment_status: "pending",
                  notes,
                  detected_document_type: "wizard_lodging",
                  detected_data: { source: "trip_creation_wizard", segment_key: segmentKey },
                  sync_to_plan: true,
                  latitude,
                  longitude,
                }),
              });
            }
          })();
        }
        return created.tripId;
      }
      if (data?.status === "needs_clarification") {
        const payload = data as ApiNeedsClarification;
        setDraftIntent(payload.draftIntent || null);
        setQuestion(payload.question || "¿Puedes darme un detalle más?");
        setStage("clarifying");
        setStep(1);
        scrollTop();
        return null;
      }
      throw new Error("Respuesta inesperada del servidor.");
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : "No se pudo crear el viaje.");
      return null;
    } finally {
      if (silent) setCreatingTripSilently(false);
      else setLoading(false);
    }
  }

  async function previewPlans() {
    if (loading || !draftIntent) return;
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewFast(false);
    setPreviewStructure(null);
    setPreviewExpandedDays(new Set());
    setPreviewEditor(null);
    setPreviewEditorError(null);
    setPreviewRefineError(null);
    // Al recalcular, reseteamos el “cache” de alojamientos para que se derive de este nuevo itinerario.
    setLodgingError(null);
    setLodgingResolved(null);
    setLodgingItinerary(null);
    try {
      const res = await fetch("/api/trips/auto-preview-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "gemini",
          draftIntent: { ...draftIntent, mustSee: derivedPlaces, wantsRouteOptimization: optimizeOrder },
          followUp: planChangeNotes.trim() ? `Cambios solicitados para el plan: ${planChangeNotes.trim()}` : "",
          config: normalizeTripAutoConfig(autoConfig),
        }),
      });
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "No se pudo previsualizar los planes.");
      if (data?.status !== "ok" || !data?.itinerary) throw new Error("Respuesta inesperada del servidor.");
      setPreviewResolved(data.resolved || null);
      setPreviewItinerary(data.itinerary || null);
      setPreviewFast(Boolean(data?.fast));
      setPreviewStructure(data?.structure || null);
      {
        const key = JSON.stringify({
          intent: { ...draftIntent, mustSee: derivedPlaces, wantsRouteOptimization: optimizeOrder },
          config: normalizeTripAutoConfig(autoConfig),
          notes: planChangeNotes.trim(),
        });
        setPreviewMemory({ itinerary: data.itinerary, resolved: (data.resolved || null) as any, key });
      }
      // Precalienta alojamientos en segundo plano reutilizando el itinerario ya generado (evita otra llamada IA).
      setLodgingResolved(data.resolved || null);
      setLodgingItinerary(data.itinerary || null);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "No se pudo previsualizar los planes.");
      setPreviewItinerary(null);
      setPreviewResolved(null);
      setPreviewFast(false);
      setPreviewStructure(null);
      setLodgingResolved(null);
      setLodgingItinerary(null);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function refinePreviewPlans() {
    if (!draftIntent || previewLoading || previewRefineLoading) return;
    if (!previewStructure) {
      setPreviewRefineError("No hay estructura de viaje para mejorar el plan. Recalcula planes primero.");
      return;
    }
    setPreviewRefineLoading(true);
    setPreviewRefineError(null);
    try {
      const res = await fetch("/api/trips/auto-refine-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "gemini",
          draftIntent: { ...draftIntent, mustSee: derivedPlaces, wantsRouteOptimization: optimizeOrder },
          followUp: planChangeNotes.trim() ? `Cambios solicitados para el plan: ${planChangeNotes.trim()}` : "",
          config: normalizeTripAutoConfig(autoConfig),
          structure: previewStructure,
          itinerary: previewItinerary,
        }),
      });
      const data = (await res.json().catch(() => null)) as any;
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "No se pudo mejorar el plan.");
      if (data?.status !== "ok" || !data?.itinerary) throw new Error("Respuesta inesperada al mejorar el plan.");
      setPreviewItinerary(data.itinerary || null);
      setPreviewFast(false);
      // Lodging debe derivarse del nuevo itinerario
      setLodgingResolved(data.resolved || previewResolved || null);
      setLodgingItinerary(data.itinerary || null);
      setPreviewMemory((prev) => (prev ? { ...prev, itinerary: data.itinerary } : prev));
    } catch (e) {
      setPreviewRefineError(e instanceof Error ? e.message : "No se pudo mejorar el plan.");
    } finally {
      setPreviewRefineLoading(false);
    }
  }

  function closePreviewModal() {
    setPreviewOpen(false);
    setPreviewLoading(false);
    setPreviewError(null);
    setPreviewEditor(null);
    setPreviewEditorError(null);
    setPreviewEditorSaving(false);
  }

  function openPreviewFromMemory() {
    if (!previewMemory) return;
    setPreviewResolved(previewMemory.resolved || null);
    setPreviewItinerary(previewMemory.itinerary || null);
    setPreviewExpandedDays(new Set());
    setPreviewEditor(null);
    setPreviewEditorError(null);
    setPreviewError(null);
    setPreviewLoading(false);
    setPreviewOpen(true);
  }

  async function ensureTripForPreviewEditor() {
    if (createdTripId) return createdTripId;
    const id = await finalizeCreateTrip({ redirectTo: "none", silent: true });
    return id;
  }

  async function fetchTripActivities(tripId: string) {
    const res = await fetch(`/api/trip-activities?tripId=${encodeURIComponent(tripId)}`);
    const data = (await res.json().catch(() => null)) as any;
    if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "No se pudo cargar el plan.");
    return (Array.isArray(data?.activities) ? data.activities : []) as any[];
  }

  function findMatchingDbActivity(activities: any[], date: string | null, it: ItineraryItemPayload | null) {
    if (!date || !it) return null;
    const title = String(it.title || "").trim();
    const time = String((it as any).start_time || "").trim();
    if (!title) return null;
    const exact = activities.find(
      (a) =>
        String(a?.activity_date || "") === date &&
        String(a?.title || "").trim() === title &&
        (time ? String(a?.activity_time || "").trim() === time : true)
    );
    if (exact) return exact;
    const loose = activities.find((a) => String(a?.activity_date || "") === date && String(a?.title || "").trim() === title);
    return loose || null;
  }

  async function openPreviewEditorForAdd(dayIndex: number, date: string | null) {
    setPreviewEditorError(null);
    setPreviewEditor({
      mode: "add",
      dayIndex,
      itemIndex: null,
      date,
      initialData: { activity_date: date },
    });
    // Creamos el viaje en segundo plano para que al guardar sea inmediato.
    void ensureTripForPreviewEditor();
  }

  async function openPreviewEditorForEdit(dayIndex: number, itemIndex: number, date: string | null, it: ItineraryItemPayload) {
    setPreviewEditorError(null);
    // Abrimos el formulario inmediatamente con datos del preview.
    setPreviewEditor({
      mode: "edit",
      dayIndex,
      itemIndex,
      date,
      initialData: {
        title: it.title || "",
        description: (it as any).description || "",
        activity_date: date,
        activity_time: String((it as any).start_time || ""),
        place_name: it.place_name || "",
        address: it.address || "",
        latitude: typeof (it as any).latitude === "number" ? (it as any).latitude : null,
        longitude: typeof (it as any).longitude === "number" ? (it as any).longitude : null,
        activity_kind: (it as any).activity_kind || null,
      },
    });

    // Intentamos enlazar con la actividad real en BD (si existe) en segundo plano.
    void (async () => {
      try {
        const tripId = await ensureTripForPreviewEditor();
        if (!tripId) return;
        const activities = await fetchTripActivities(tripId);
        const matched = findMatchingDbActivity(activities, date, it);
        if (!matched?.id) return;
        setPreviewEditor((cur) => {
          if (!cur) return cur;
          if (cur.dayIndex !== dayIndex || cur.itemIndex !== itemIndex) return cur;
          return {
            ...cur,
            initialData: {
              id: matched.id,
              title: matched.title,
              description: matched.description,
              rating: matched.rating ?? null,
              comment: matched.comment ?? null,
              activity_date: matched.activity_date,
              activity_time: matched.activity_time,
              place_name: matched.place_name,
              address: matched.address,
              latitude: matched.latitude,
              longitude: matched.longitude,
              activity_kind: matched.activity_kind,
            },
          };
        });
      } catch {
        // ignore
      }
    })();
  }

  async function deletePreviewItem(dayIndex: number, itemIndex: number, date: string | null, it: ItineraryItemPayload) {
    setPreviewEditorError(null);
    const tripId = await ensureTripForPreviewEditor();
    if (!tripId) return;
    try {
      const activities = await fetchTripActivities(tripId);
      const matched = findMatchingDbActivity(activities, date, it);
      if (matched?.id) {
        const res = await fetch(`/api/trip-activities/${encodeURIComponent(String(matched.id))}`, { method: "DELETE" });
        const data = (await res.json().catch(() => null)) as any;
        if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "No se pudo eliminar.");
      }
    } catch (e) {
      setPreviewEditorError(e instanceof Error ? e.message : "No se pudo eliminar el plan.");
      return;
    }

    setPreviewItinerary((prev) => {
      if (!prev?.days?.length) return prev;
      const days = prev.days.map((d) => ({ ...d, items: Array.isArray((d as any).items) ? [...((d as any).items as any[])] : [] })) as any[];
      const day = days[dayIndex];
      if (!day?.items?.length) return prev;
      day.items.splice(itemIndex, 1);
      return { ...prev, days };
    });

    setPreviewEditor((cur) => {
      if (!cur) return cur;
      if (cur.dayIndex === dayIndex && cur.itemIndex === itemIndex) return null;
      return cur;
    });
  }

  function swap<T>(arr: T[], a: number, b: number) {
    const tmp = arr[a];
    arr[a] = arr[b] as T;
    arr[b] = tmp as T;
  }

  function movePreviewItem(params: { fromDay: number; fromIndex: number; toDay: number; toIndex: number }) {
    setPreviewItinerary((prev) => {
      if (!prev?.days?.length) return prev;
      const days = prev.days.map((d) => ({
        ...d,
        items: Array.isArray((d as any).items) ? [...((d as any).items as any[])] : [],
      })) as any[];
      const srcDay = days[params.fromDay];
      const dstDay = days[params.toDay];
      if (!srcDay || !dstDay) return prev;
      const srcItems = (srcDay.items || []) as any[];
      const dstItems = (dstDay.items || []) as any[];
      if (params.fromIndex < 0 || params.fromIndex >= srcItems.length) return prev;
      const [moved] = srcItems.splice(params.fromIndex, 1);
      const insertAt = Math.max(0, Math.min(dstItems.length, params.toIndex));
      dstItems.splice(insertAt, 0, moved);
      srcDay.items = srcItems;
      dstDay.items = dstItems;
      return { ...prev, days };
    });
  }

  function reorderPreviewItem(dayIndex: number, itemIndex: number, dir: -1 | 1) {
    setPreviewItinerary((prev) => {
      if (!prev?.days?.length) return prev;
      const days = prev.days.map((d) => ({ ...d, items: Array.isArray((d as any).items) ? [...((d as any).items as any[])] : [] })) as any[];
      const day = days[dayIndex];
      if (!day?.items?.length) return prev;
      const nextIndex = itemIndex + dir;
      if (nextIndex < 0 || nextIndex >= day.items.length) return prev;
      swap(day.items, itemIndex, nextIndex);
      return { ...prev, days };
    });
  }

  async function submitPreviewForm(values: PlanFormValues) {
    setPreviewEditorError(null);
    const tripId = await ensureTripForPreviewEditor();
    if (!tripId) return;
    if (!previewEditor) return;
    setPreviewEditorSaving(true);
    try {
      const body = {
        tripId,
        title: values.title,
        description: values.description,
        rating: values.rating || null,
        comment: values.comment || null,
        activity_date: values.activityDate || previewEditor.date || null,
        activity_time: values.activityTime || null,
        place_name: values.placeName || null,
        address: values.address || null,
        latitude: values.latitude,
        longitude: values.longitude,
        activity_type: values.activityKind,
        activity_kind: values.activityKind,
        source: "wizard_preview",
      };

      const existingId = previewEditor.initialData?.id;
      let saved: any;
      if (existingId) {
        const res = await fetch(`/api/trip-activities/${encodeURIComponent(String(existingId))}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await res.json().catch(() => null)) as any;
        if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "No se pudo guardar.");
        saved = data?.activity;
      } else {
        const res = await fetch("/api/trip-activities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await res.json().catch(() => null)) as any;
        if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "No se pudo crear.");
        saved = data?.activity;
      }

      setPreviewItinerary((prev) => {
        if (!prev?.days?.length) return prev;
        const days = prev.days.map((d) => ({ ...d, items: Array.isArray((d as any).items) ? [...((d as any).items as any[])] : [] })) as any[];
        const day = days[previewEditor.dayIndex];
        if (!day) return prev;
        const nextItem: any = {
          title: String(saved?.title || values.title || "Plan"),
          place_name: saved?.place_name ?? values.placeName ?? null,
          address: saved?.address ?? values.address ?? null,
          start_time: saved?.activity_time ?? values.activityTime ?? null,
          latitude: typeof saved?.latitude === "number" ? saved.latitude : values.latitude ?? null,
          longitude: typeof saved?.longitude === "number" ? saved.longitude : values.longitude ?? null,
          activity_kind: saved?.activity_kind ?? values.activityKind ?? null,
          description: saved?.description ?? values.description ?? null,
        };
        if (previewEditor.mode === "add") {
          (day.items || []).push(nextItem);
        } else if (previewEditor.itemIndex != null) {
          (day.items || [])[previewEditor.itemIndex] = { ...((day.items || [])[previewEditor.itemIndex] || {}), ...nextItem };
        }
        return { ...prev, days };
      });

      setPreviewEditor((cur) => {
        if (!cur) return cur;
        return {
          ...cur,
          mode: "edit",
          initialData: saved
            ? {
                id: saved.id,
                title: saved.title,
                description: saved.description,
                rating: saved.rating ?? null,
                comment: saved.comment ?? null,
                activity_date: saved.activity_date,
                activity_time: saved.activity_time,
                place_name: saved.place_name,
                address: saved.address,
                latitude: saved.latitude,
                longitude: saved.longitude,
                activity_kind: saved.activity_kind,
              }
            : cur.initialData,
        };
      });
    } catch (e) {
      setPreviewEditorError(e instanceof Error ? e.message : "No se pudo guardar el plan.");
    } finally {
      setPreviewEditorSaving(false);
    }
  }

  if (!isPremium) {
    return (
      <div className="mx-auto max-w-2xl px-4">
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
          <div className="text-sm font-extrabold text-amber-950">Asistente automático · Premium</div>
          <p className="mt-2 text-sm text-amber-900">
            Para crear un viaje prácticamente automático (planes + rutas) necesitas Premium. Si quieres, puedes crear el viaje a mano desde el dashboard.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => router.push("/dashboard#create-trip")}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-amber-200 bg-white px-4 py-3 text-sm font-semibold text-amber-950 hover:bg-amber-100"
            >
              Volver al dashboard
            </button>
            <button
              type="button"
              onClick={() => router.push("/account?upgrade=premium&focus=premium#premium-plans")}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Mejorar a Premium
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={topRef} className="mx-auto max-w-4xl px-4">
      {creatingOverlay ? (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-950/60 p-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-slate-950 px-7 py-8 text-center text-white shadow-2xl">
            <img
              src="/icons/icon-512.png"
              alt="Kaviro"
              className="mx-auto h-20 w-20 rounded-[24px] object-cover shadow-2xl"
            />
            <div
              className="mt-5 text-3xl font-black tracking-tight"
              style={{
                backgroundImage: "linear-gradient(135deg, #2563eb, #06b6d4)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              Kaviro
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-200">Creando viaje…</div>
            <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-slate-800">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-cyan-500" />
            </div>
          </div>
        </div>
      ) : null}
      <header className="sticky top-0 z-30 -mx-4 border-b border-slate-200 bg-white/80 px-4 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goBack}
              disabled={loading}
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
              aria-label="Atrás"
              title="Atrás"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
            </button>
            <div>
              <div className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-violet-700">VIAJE</div>
              <div className="text-sm font-extrabold text-slate-950">{stepTitle(step)}</div>
            </div>
          </div>

          <Stepper activeStep={step} />
        </div>
      </header>

      {error ? (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <span className="font-semibold">Error:</span> {error}
        </div>
      ) : null}

      <section className="mt-5 space-y-4">
        {step === 1 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-600 text-white">
                <Compass className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0">
                <div className="text-base font-extrabold text-slate-950">Crea tu viaje en 1 minuto</div>
                <p className="mt-1 text-sm text-slate-600">
                  Rellena lo básico. Luego afinas preferencias y previsualizas antes de crearlo.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 sm:col-span-2">
                <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Destinos (pueden ser varios)</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {destinations.map((tag, idx) => {
                    const isPrimary = idx === 0;
                    return (
                      <span
                        key={`${tag}-${idx}`}
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-extrabold ${
                          isPrimary ? "border-violet-300 bg-violet-50 text-violet-950" : "border-slate-200 bg-white text-slate-800"
                        }`}
                        title={isPrimary ? "Destino principal" : "Click para hacerlo principal"}
                      >
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => makePrimaryDestination(tag)}
                          className="min-w-0 truncate text-left"
                        >
                          {isPrimary ? "Principal: " : ""}
                          {tag}
                        </button>
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => removeDestinationTag(tag)}
                          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 disabled:opacity-60"
                          title="Quitar"
                          aria-label="Quitar destino"
                        >
                          <X className="h-3 w-3" aria-hidden />
                        </button>
                      </span>
                    );
                  })}
                </div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    value={destinationAdd}
                    onChange={(e) => setDestinationAdd(e.target.value)}
                    disabled={loading}
                    placeholder="Ej. Argentina · Uruguay · Buenos Aires · Iguazú…"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
                  />
                  <button
                    type="button"
                    onClick={() => addDestinationTag(destinationAdd)}
                    disabled={loading || !destinationAdd.trim()}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-extrabold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-60"
                  >
                    <Plus className="h-4 w-4" aria-hidden />
                    Añadir
                  </button>
                </div>
                <div className="mt-2 text-[11px] font-semibold text-slate-500">
                  El primero es el <span className="font-extrabold">principal</span>; el resto se usarán como paradas/objetivos del plan.
                </div>
              </label>

              <label className="space-y-1">
                <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Fecha inicio</span>
                <input
                  type="date"
                  value={String(draftIntent?.startDate || "")}
                  onChange={(e) =>
                    setDraftIntent((prev) => syncDurationFromDates({ ...(prev || {}), startDate: e.target.value || null }))
                  }
                  disabled={loading}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Fecha fin</span>
                <input
                  type="date"
                  value={String(draftIntent?.endDate || "")}
                  onChange={(e) =>
                    setDraftIntent((prev) => syncDurationFromDates({ ...(prev || {}), endDate: e.target.value || null }))
                  }
                  disabled={loading}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Origen (opcional)</span>
                <input
                  value={String(draftIntent?.startLocation || "")}
                  onChange={(e) => setDraftIntent((prev) => ({ ...(prev || {}), startLocation: e.target.value || null }))}
                  onBlur={(e) =>
                    setDraftIntent((prev) => ({ ...(prev || {}), startLocation: e.target.value.trim() || null }))
                  }
                  disabled={loading}
                  placeholder="Ej. Madrid"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Fin (opcional)</span>
                <input
                  value={String(draftIntent?.endLocation || "")}
                  onChange={(e) => setDraftIntent((prev) => ({ ...(prev || {}), endLocation: e.target.value || null }))}
                  onBlur={(e) => setDraftIntent((prev) => ({ ...(prev || {}), endLocation: e.target.value.trim() || null }))}
                  disabled={loading}
                  placeholder="Ej. Buenos Aires"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
                />
              </label>
            </div>

            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-600">Opcional: cuéntame detalles</div>
              <div className="mt-1 text-xs text-slate-600">
                Si quieres, añade estilo/intereses. Si lo dejas vacío, no pasa nada.
              </div>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                disabled={loading}
                placeholder={PROMPT_EXAMPLE}
                className="mt-3 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
              />
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => {
                  // asegura que exista draftIntent para el siguiente paso
                  setDraftIntent((prev) => ({ ...(prev || {}) }));
                  goNext();
                }}
                disabled={!canContinue}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
              >
                <Check className="h-4 w-4" aria-hidden />
                Continuar
              </button>
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                disabled={loading}
                className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-extrabold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
            <div className="min-w-0 space-y-4">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-base font-extrabold text-slate-950">Preferencias</div>
                <p className="mt-1 text-sm text-slate-600">
                  Ajusta el estilo del viaje. En el siguiente paso verás la previsualización y podrás crear el viaje.
                </p>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Tipo de viajeros</span>
                    <select
                      value={travelersType}
                      onChange={(e) => setTravelersType(e.target.value)}
                      disabled={loading}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
                    >
                      <option value="solo">Solo</option>
                      <option value="couple">En pareja</option>
                      <option value="friends">Con amigos</option>
                      <option value="family">Con familia</option>
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Nº viajeros (opcional)</span>
                    <input
                      value={typeof travelersCount === "number" ? String(travelersCount) : ""}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        setTravelersCount(Number.isFinite(n) && n > 0 ? Math.min(50, Math.round(n)) : null);
                      }}
                      inputMode="numeric"
                      disabled={loading}
                      placeholder="Ej. 2"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
                    />
                  </label>
                </div>

                <label className="mt-3 block space-y-1">
                  <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Nombres (opcional)</span>
                  <input
                    value={travelerNamesText}
                    onChange={(e) => setTravelerNamesText(e.target.value)}
                    disabled={loading}
                    placeholder="Ej. Unai, Ainhoa, ... (separados por comas)"
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
                  />
                </label>

                <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Presupuesto</div>
                  <div role="radiogroup" aria-label="Presupuesto" className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {(
                      [
                        { key: "low" as const, label: "Bajo" },
                        { key: "medium" as const, label: "Medio" },
                        { key: "high" as const, label: "Alto" },
                      ] as const
                    ).map((opt) => {
                      const active = (draftIntent?.budgetLevel || "medium") === opt.key;
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          disabled={loading}
                          onClick={() => setDraftIntent((prev) => ({ ...(prev || {}), budgetLevel: opt.key }))}
                          className={`min-h-[42px] rounded-2xl border px-3 py-2 text-xs font-extrabold transition ${
                            active
                              ? "border-violet-300 bg-violet-50 text-violet-900"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          } disabled:opacity-60`}
                          aria-pressed={active}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Intereses</div>
                  <p className="mt-1 text-sm text-slate-600">Selecciona varios para guiar el plan.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {INTEREST_TAGS.map((tag) => {
                      const active = intentInterests.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          disabled={loading}
                          onClick={() => toggleIntentTag("interests", tag)}
                          className={`rounded-full border px-3 py-2 text-xs font-extrabold transition disabled:opacity-60 ${
                            active
                              ? "border-violet-300 bg-violet-50 text-violet-950"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          }`}
                          aria-pressed={active}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Estilo</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {STYLE_TAGS.map((tag) => {
                      const active = intentStyles.includes(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          disabled={loading}
                          onClick={() => toggleIntentTag("travelStyle", tag)}
                          className={`rounded-full border px-3 py-2 text-xs font-extrabold transition disabled:opacity-60 ${
                            active
                              ? "border-violet-300 bg-violet-50 text-violet-950"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          }`}
                          aria-pressed={active}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Alojamiento</div>
                  <p className="mt-1 text-sm text-slate-600">Base fija o rotar ciudades (afecta estructura y traslados).</p>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {(
                      [
                        { key: "rotate" as const, label: "Rotar entre ciudades" },
                        { key: "single" as const, label: "Siempre la misma ciudad" },
                      ] as const
                    ).map((opt) => {
                      const active = (autoConfig.lodging.baseCityMode || "rotate") === opt.key;
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          disabled={loading}
                          onClick={() =>
                            setAutoConfig((p) => ({
                              ...p,
                              lodging: {
                                ...p.lodging,
                                baseCityMode: opt.key,
                                baseCity: opt.key === "single" ? (p.lodging.baseCity || "") : "",
                              },
                            }))
                          }
                          className={`min-h-[42px] rounded-2xl border px-3 py-2 text-xs font-extrabold transition ${
                            active
                              ? "border-violet-300 bg-violet-50 text-violet-900"
                              : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          } disabled:opacity-60`}
                          aria-pressed={active}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                  {autoConfig.lodging.baseCityMode === "single" ? (
                    <label className="mt-3 block space-y-1">
                      <span className="text-xs font-extrabold text-slate-700">Ciudad base de alojamiento</span>
                      <input
                        value={autoConfig.lodging.baseCity || ""}
                        onChange={(e) => setAutoConfig((p) => ({ ...p, lodging: { ...p.lodging, baseCity: e.target.value } }))}
                        disabled={loading}
                        placeholder="Ej. Buenos Aires"
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
                      />
                    </label>
                  ) : null}
                </div>

                <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Imprescindibles</div>
                  <p className="mt-1 text-sm text-slate-600">Añade ciudades o sitios que quieres sí o sí.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {derivedPlaces.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-800"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => removePlaceTag(tag)}
                          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                          title="Quitar"
                        >
                          <X className="h-3 w-3" aria-hidden />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input
                      value={placeAdd}
                      onChange={(e) => setPlaceAdd(e.target.value)}
                      disabled={loading}
                      placeholder={placesPlaceholder}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
                    />
                    <button
                      type="button"
                      onClick={() => addPlaceTag(placeAdd)}
                      disabled={loading || !placeAdd.trim()}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-extrabold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-60"
                    >
                      <Plus className="h-4 w-4" aria-hidden />
                      Añadir
                    </button>
                  </div>
                </div>

                <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-violet-600"
                    checked={optimizeOrder}
                    disabled={loading}
                    onChange={(e) => {
                      const v = Boolean(e.target.checked);
                      setOptimizeTouched(true);
                      setOptimizeOrder(v);
                      setDraftIntent((prev) => ({ ...(prev || {}), wantsRouteOptimization: v }));
                    }}
                  />
                  <span className="min-w-0">
                    <span className="font-extrabold text-slate-950">Optimizar orden</span>{" "}
                    <span className="text-slate-600">(reduce traslados)</span>
                  </span>
                </label>

                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
                    <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-700">
                      Ajustes de generación
                      <span className="ml-2 font-semibold tracking-normal text-slate-500">(editable)</span>
                    </div>
                    <div className="text-[11px] font-semibold text-slate-500">Afectan a la previsualización.</div>
                  </div>

                  <div className="p-4">
                    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                      <label className="space-y-1">
                        <span className="text-xs font-extrabold text-slate-700">Ritmo (planes/día)</span>
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            value={autoConfig.pace.itemsPerDayMin}
                            onChange={(e) =>
                              setAutoConfig((p) => ({
                                ...p,
                                pace: { ...p.pace, itemsPerDayMin: Math.max(1, Math.min(12, Number(e.target.value) || 1)) },
                              }))
                            }
                            disabled={creatingOverlay}
                            inputMode="numeric"
                            className="w-20 shrink-0 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
                          />
                          <span className="self-center text-xs font-extrabold text-slate-500">a</span>
                          <input
                            value={autoConfig.pace.itemsPerDayMax}
                            onChange={(e) =>
                              setAutoConfig((p) => ({
                                ...p,
                                pace: { ...p.pace, itemsPerDayMax: Math.max(1, Math.min(12, Number(e.target.value) || 1)) },
                              }))
                            }
                            disabled={creatingOverlay}
                            inputMode="numeric"
                            className="w-20 shrink-0 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
                          />
                          <span className="text-[11px] font-semibold text-slate-500">recomendado: 3–5</span>
                        </div>
                      </label>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-extrabold text-slate-700">Coherencia geográfica</span>
                        </div>
                        <div
                          role="radiogroup"
                          aria-label="Coherencia geográfica"
                          className="flex w-full gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50 p-1"
                        >
                          {(
                            [
                              { key: "auto" as const, label: "Auto" },
                              { key: "balanced" as const, label: "Equilibrada" },
                              { key: "strict" as const, label: "Estricta" },
                              { key: "loose" as const, label: "Flexible" },
                            ] as const
                          ).map((opt) => {
                            const active = (autoConfig.geo.strictness ?? "auto") === opt.key;
                            return (
                              <button
                                key={opt.key}
                                type="button"
                                disabled={creatingOverlay}
                                onClick={() => setAutoConfig((p) => ({ ...p, geo: { ...p.geo, strictness: opt.key } }))}
                                className={`min-h-[42px] shrink-0 whitespace-nowrap rounded-xl border px-3 py-2 text-xs font-extrabold transition ${
                                  active
                                    ? "border-violet-300 bg-white text-violet-900 shadow-sm"
                                    : "border-transparent bg-transparent text-slate-700 hover:bg-white"
                                } disabled:opacity-60`}
                                aria-pressed={active}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-3 grid-cols-1 lg:grid-cols-2">
                      <div className="space-y-2 lg:col-span-2">
                        <div className="text-xs font-extrabold text-slate-700">Reglas de movilidad (recomendado)</div>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                          <label className="space-y-1">
                            <span className="text-[11px] font-semibold text-slate-500">Andando hasta (min)</span>
                            <input
                              value={mobilityWalkLimitMin}
                              onChange={(e) => setMobilityWalkLimitMin(Math.max(10, Math.min(120, Number(e.target.value) || 45)))}
                              disabled={creatingOverlay}
                              inputMode="numeric"
                              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
                            />
                          </label>
                          <label className="space-y-1">
                            <span className="text-[11px] font-semibold text-slate-500">En ciudad si es lejos</span>
                            <select
                              value={mobilityCityLongMode}
                              onChange={(e) => setMobilityCityLongMode((e.target.value as any) || "public_transport")}
                              disabled={creatingOverlay}
                              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
                            >
                              <option value="public_transport">Transporte público</option>
                              <option value="taxi">Taxi</option>
                              <option value="driving">Coche</option>
                            </select>
                          </label>
                          <label className="space-y-1">
                            <span className="text-[11px] font-semibold text-slate-500">Entre ciudades</span>
                            <select
                              value={mobilityIntercityPreference}
                              onChange={(e) => setMobilityIntercityPreference((e.target.value as any) || "best")}
                              disabled={creatingOverlay}
                              className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
                            >
                              <option value="best">Mejor opción (auto)</option>
                              <option value="train_first">Priorizar tren</option>
                              <option value="flight_first">Priorizar vuelo</option>
                              <option value="bus_first">Priorizar autobús</option>
                            </select>
                          </label>
                        </div>
                        <div className="text-[11px] font-semibold text-slate-500 whitespace-pre-wrap">
                          {mobilityRulesText}
                        </div>
                      </div>

                      <label className="space-y-1 lg:col-span-2">
                        <span className="text-xs font-extrabold text-slate-700">Preferencias de transporte y rutas</span>
                        <textarea
                          value={autoConfig.transport.notes}
                          onChange={(e) => setAutoConfig((p) => ({ ...p, transport: { ...p.transport, notes: e.target.value } }))}
                          disabled={creatingOverlay}
                          rows={4}
                          placeholder="Ej.\n- Dentro de ciudad: a pie + metro\n- Entre ciudades: tren\n- Islas: ferry\n- Si una ruta supera 3h: vuelo\n- Por la noche: taxi"
                          className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
                        />
                        <div className="text-[11px] font-semibold text-slate-500">
                          Puedes escribir reglas por duración (“&gt; 3h”), por tipo de trayecto y excepciones.
                        </div>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={() => {
                      setDraftIntent((prev) => ({
                        ...(prev || {}),
                        travelersType: (travelersType as any) || null,
                        travelersCount: typeof travelersCount === "number" ? travelersCount : null,
                      }));
                      setStep(3);
                      scrollTop();
                      void previewPlans();
                    }}
                    disabled={!canContinue}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
                  >
                    <Check className="h-4 w-4" aria-hidden />
                    Ver previsualización
                  </button>
                  <button
                    type="button"
                    onClick={goBack}
                    disabled={loading}
                    className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-extrabold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Atrás
                  </button>
                </div>
              </div>
            </div>

            <aside className="min-w-0 space-y-4">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Resumen</div>
                <div className="mt-3 grid gap-2 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-slate-500">Destino</span>
                    <span className="text-right font-extrabold text-slate-950">{destinationLabel || "—"}</span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-slate-500">Fechas</span>
                    <span className="text-right font-semibold text-slate-900">
                      {draftIntent?.startDate && draftIntent?.endDate ? `${draftIntent.startDate} → ${draftIntent.endDate}` : "—"}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-slate-500">Imprescindibles</span>
                    <span className="text-right font-semibold text-slate-900">{derivedPlaces.length ? derivedPlaces.length : "—"}</span>
                  </div>
                </div>
              </div>
            </aside>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
            <div className="min-w-0 space-y-4">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-base font-extrabold text-slate-950">Revisión rápida</div>
                <p className="mt-1 text-sm text-slate-600">
                  Ajusta lo imprescindible y previsualiza. Luego crea el viaje y podrás editarlo todo.
                </p>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Origen</span>
                    <input
                      value={(draftIntent?.startLocation || "") ?? ""}
                      onChange={(e) => setDraftIntent((prev) => ({ ...(prev || {}), startLocation: e.target.value || null }))}
                      onBlur={(e) =>
                        setDraftIntent((prev) => ({ ...(prev || {}), startLocation: e.target.value.trim() || null }))
                      }
                      disabled={loading}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Destino</span>
                    <input
                      value={(draftIntent?.endLocation || "") ?? ""}
                      onChange={(e) => setDraftIntent((prev) => ({ ...(prev || {}), endLocation: e.target.value || null }))}
                      onBlur={(e) => setDraftIntent((prev) => ({ ...(prev || {}), endLocation: e.target.value.trim() || null }))}
                      disabled={loading}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
                    />
                  </label>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <label className="space-y-1">
                    <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Fecha inicio</span>
                    <input
                      type="date"
                      value={(draftIntent?.startDate || "") ?? ""}
                      onChange={(e) =>
                        setDraftIntent((prev) => syncDurationFromDates({ ...(prev || {}), startDate: e.target.value || null }))
                      }
                      disabled={loading}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Fecha fin</span>
                    <input
                      type="date"
                      value={(draftIntent?.endDate || "") ?? ""}
                      onChange={(e) =>
                        setDraftIntent((prev) => syncDurationFromDates({ ...(prev || {}), endDate: e.target.value || null }))
                      }
                      disabled={loading}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Duración</span>
                    <input
                      value={
                        typeof draftIntent?.durationDays === "number" && draftIntent.durationDays
                          ? `${draftIntent.durationDays} días`
                          : "—"
                      }
                      disabled
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm outline-none"
                    />
                  </label>
                </div>

                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
                    <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-700">
                      Ajustes de generación
                      <span className="ml-2 font-semibold tracking-normal text-slate-500">(editable)</span>
                    </div>
                    <div className="text-[11px] font-semibold text-slate-500">
                      Estos ajustes afectan a la previsualización y al viaje que se creará.
                    </div>
                  </div>

                  <div className="p-4">
                  <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                    <label className="space-y-1">
                      <span className="text-xs font-extrabold text-slate-700">Ritmo (planes/día)</span>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          value={autoConfig.pace.itemsPerDayMin}
                          onChange={(e) =>
                            setAutoConfig((p) => ({
                              ...p,
                              pace: { ...p.pace, itemsPerDayMin: Math.max(1, Math.min(12, Number(e.target.value) || 1)) },
                            }))
                          }
                          disabled={creatingOverlay}
                          inputMode="numeric"
                          className="w-20 shrink-0 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
                        />
                        <span className="self-center text-xs font-extrabold text-slate-500">a</span>
                        <input
                          value={autoConfig.pace.itemsPerDayMax}
                          onChange={(e) =>
                            setAutoConfig((p) => ({
                              ...p,
                              pace: { ...p.pace, itemsPerDayMax: Math.max(1, Math.min(12, Number(e.target.value) || 1)) },
                            }))
                          }
                          disabled={creatingOverlay}
                          inputMode="numeric"
                          className="w-20 shrink-0 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
                        />
                        <span className="text-[11px] font-semibold text-slate-500">recomendado: 3–5</span>
                      </div>
                    </label>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-extrabold text-slate-700">Coherencia geográfica</span>
                        <details className="relative">
                          <summary
                            className="list-none cursor-pointer rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px] font-extrabold text-slate-600 hover:bg-slate-50"
                            title="Ayuda"
                            aria-label="Ayuda sobre coherencia geográfica"
                          >
                            ?
                          </summary>
                          <div className="absolute right-0 bottom-8 z-20 w-[min(320px,80vw)] rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-xl">
                            <div className="text-xs font-extrabold text-slate-950">¿Qué significa cada opción?</div>
                            <ul className="mt-2 space-y-1">
                              <li>
                                <span className="font-extrabold">Equilibrada</span>: una ciudad principal por día; permite excursiones cercanas
                                (aprox. 30–60 km) sin “teletransportes”.
                              </li>
                              <li>
                                <span className="font-extrabold">Muy estricta</span>: misma ciudad por día. Cambios de ciudad solo con un bloque de{" "}
                                <span className="font-extrabold">transporte</span>.
                              </li>
                              <li>
                                <span className="font-extrabold">Flexible</span>: permite mezclar más cosas en un día, pensado para que luego lo ajustes
                                manualmente.
                              </li>
                            </ul>
                            <div className="mt-2 text-[11px] font-semibold text-slate-500">
                              Tip: si ves días imposibles, usa <span className="font-extrabold">Muy estricta</span>.
                            </div>
                          </div>
                        </details>
                      </div>
                      <div
                        role="radiogroup"
                        aria-label="Coherencia geográfica"
                        className="flex w-full gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50 p-1"
                      >
                        {(
                          [
                            { key: "auto" as const, label: "Auto" },
                            { key: "balanced" as const, label: "Equilibrada" },
                            { key: "strict" as const, label: "Estricta" },
                            { key: "loose" as const, label: "Flexible" },
                          ] as const
                        ).map((opt) => {
                          const active = (autoConfig.geo.strictness ?? "auto") === opt.key;
                          return (
                            <button
                              key={opt.key}
                              type="button"
                              disabled={creatingOverlay}
                              onClick={() =>
                                setAutoConfig((p) => ({ ...p, geo: { ...p.geo, strictness: opt.key } }))
                              }
                              className={`min-h-[42px] shrink-0 whitespace-nowrap rounded-xl border px-3 py-2 text-xs font-extrabold transition ${
                                active
                                  ? "border-violet-300 bg-white text-violet-900 shadow-sm"
                                  : "border-transparent bg-transparent text-slate-700 hover:bg-white"
                              } disabled:opacity-60`}
                              aria-pressed={active}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                      <input
                        value={autoConfig.geo.strictness ?? "balanced"}
                        readOnly
                        aria-hidden
                        tabIndex={-1}
                        className="sr-only"
                      />
                    </div>

                  </div>

                  <div className="mt-3 grid gap-3 grid-cols-1 lg:grid-cols-2">
                    <label className="space-y-1 lg:col-span-2">
                      <span className="text-xs font-extrabold text-slate-700">Preferencias de transporte y rutas</span>
                      <textarea
                        value={autoConfig.transport.notes}
                        onChange={(e) => setAutoConfig((p) => ({ ...p, transport: { ...p.transport, notes: e.target.value } }))}
                        disabled={creatingOverlay}
                        rows={4}
                        placeholder="Ej.\n- Dentro de ciudad: a pie + metro\n- Entre ciudades: tren\n- Islas: ferry\n- Si una ruta supera 3h: vuelo\n- Por la noche: taxi"
                        className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
                      />
                      <div className="text-[11px] font-semibold text-slate-500">
                        Puedes escribir reglas por duración (“&gt; 3h”), por tipo de trayecto (ciudad vs interurbano) y excepciones.
                      </div>
                    </label>

                    <div className="space-y-1">
                      <span className="text-xs font-extrabold text-slate-700">Alojamiento</span>
                      <div role="radiogroup" aria-label="Alojamiento" className="grid grid-cols-2 gap-2">
                        {(
                          [
                            { key: "proposal" as const, label: "Propuesta" },
                            { key: "manual" as const, label: "Manual" },
                            { key: "scan" as const, label: "Escanear" },
                            { key: "omit" as const, label: "Omitir" },
                          ] as const
                        ).map((opt) => {
                          const active = (autoConfig.lodging.mode ?? "proposal") === opt.key;
                          return (
                            <button
                              key={opt.key}
                              type="button"
                              disabled={creatingOverlay}
                              onClick={() =>
                                setAutoConfig((p) => ({
                                  ...p,
                                  lodging: { ...p.lodging, mode: opt.key },
                                }))
                              }
                              className={`min-h-[42px] rounded-2xl border px-3 py-2 text-xs font-extrabold transition ${
                                active
                                  ? "border-violet-300 bg-violet-50 text-violet-900"
                                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                              } disabled:opacity-60`}
                              aria-pressed={active}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                      <input value={autoConfig.lodging.mode ?? "proposal"} readOnly aria-hidden tabIndex={-1} className="sr-only" />
                      <div className="text-[11px] font-semibold text-slate-500">
                        {autoConfig.lodging.mode === "omit"
                          ? "No se sugerirán alojamientos automáticamente."
                          : autoConfig.lodging.mode === "manual" || autoConfig.lodging.mode === "scan"
                            ? "Podrás añadir alojamientos manualmente después de crear el viaje."
                            : "Se sugerirán alojamientos (puedes cambiarlos después)."}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <span className="text-xs font-extrabold text-slate-700">Ciudad base de alojamiento</span>
                      <div role="radiogroup" aria-label="Ciudad base de alojamiento" className="grid grid-cols-2 gap-2">
                        {(
                          [
                            { key: "rotate" as const, label: "Rotar entre ciudades" },
                            { key: "single" as const, label: "Siempre la misma ciudad" },
                          ] as const
                        ).map((opt) => {
                          const active = (autoConfig.lodging.baseCityMode ?? "rotate") === opt.key;
                          return (
                            <button
                              key={opt.key}
                              type="button"
                              disabled={creatingOverlay}
                              onClick={() =>
                                setAutoConfig((p) => ({
                                  ...p,
                                  lodging: {
                                    ...p.lodging,
                                    baseCityMode: opt.key,
                                    ...(opt.key === "rotate" ? { baseCity: "" } : {}),
                                  },
                                }))
                              }
                              className={`min-h-[42px] rounded-2xl border px-3 py-2 text-xs font-extrabold transition ${
                                active
                                  ? "border-violet-300 bg-violet-50 text-violet-900"
                                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                              } disabled:opacity-60`}
                              aria-pressed={active}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                      <input
                        value={autoConfig.lodging.baseCityMode ?? "rotate"}
                        readOnly
                        aria-hidden
                        tabIndex={-1}
                        className="sr-only"
                      />
                      {autoConfig.lodging.baseCityMode === "single" ? (
                        <input
                          value={autoConfig.lodging.baseCity}
                          onChange={(e) => setAutoConfig((p) => ({ ...p, lodging: { ...p.lodging, baseCity: e.target.value } }))}
                          disabled={creatingOverlay}
                          placeholder="Ej. Zagreb"
                          className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
                        />
                      ) : (
                        <div className="text-[11px] font-semibold text-slate-500">El asistente repartirá días por ciudades para reducir traslados.</div>
                      )}
                    </div>
                  </div>

                  <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 shrink-0 accent-violet-600"
                      checked={autoConfig.routes.enabled}
                      disabled={loading}
                      onChange={(e) => setAutoConfig((p) => ({ ...p, routes: { ...p.routes, enabled: Boolean(e.target.checked) } }))}
                    />
                    <span className="min-w-0">
                      <span className="font-extrabold text-slate-950">Generar rutas</span>{" "}
                      <span className="text-slate-600">(se calcularán rutas en mapa cuando sea posible)</span>
                    </span>
                  </label>
                  </div>
                </div>

                <div className="mt-4">
                  <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">
                    Lugares a visitar (añade y se crearán etiquetas)
                  </div>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      value={placeAdd}
                      onChange={(e) => setPlaceAdd(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addPlaceTag(placeAdd);
                        }
                      }}
                      disabled={loading}
                      placeholder={placesPlaceholder}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
                    />
                    <button
                      type="button"
                      onClick={() => addPlaceTag(placeAdd)}
                      disabled={loading || !placeAdd.trim()}
                      className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-extrabold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-60"
                    >
                      Añadir
                    </button>
                  </div>
                  {derivedPlaces.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {derivedPlaces.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          disabled={loading}
                          onClick={() => removePlaceTag(tag)}
                          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-60"
                          title="Quitar"
                        >
                          <span className="max-w-[280px] truncate">{tag}</span>
                          <span className="text-slate-400" aria-hidden>
                            ×
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      Añade al menos 1 sitio si quieres que el asistente lo tenga muy en cuenta.
                    </div>
                  )}
                </div>

                {autoConfig.lodging.mode === "proposal" || autoConfig.lodging.mode === "manual" || autoConfig.lodging.mode === "scan" ? (
                  <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Alojamientos</div>
                    <div className="mt-1 text-sm font-extrabold text-slate-950">Búsqueda por ciudad y noches</div>
                    <div className="mt-1 text-xs text-slate-600">
                      Generamos tramos de noches por ciudad a partir del itinerario. Usa los botones para buscar hoteles con fechas reales.
                    </div>

                    {autoConfig.lodging.mode === "proposal" && lodgingLoading ? (
                      <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                        Calculando tramos de alojamiento…
                      </div>
                    ) : autoConfig.lodging.mode === "proposal" && lodgingError ? (
                      <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                        <span className="font-semibold">Error:</span> {lodgingError}
                      </div>
                    ) : lodgingCities.length ? (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {lodgingCities.map((seg: LodgingSeg) => {
                          const city = seg.city || "Sin ciudad";
                          const checkin = seg.startDate || draftIntent?.startDate || null;
                          const checkout = seg.endDate || null;
                          const segKey = seg.segmentKey;
                          const action = lodgingActionBySegment[segKey] || "none";
                          const open = lodgingOpenSegment === segKey;
                          const manual = lodgingManualBySegment[segKey] || { name: "", address: "", notes: "" };
                          const scanLoading = Boolean(lodgingScanLoadingBySegment[segKey]);
                          const scanError = String(lodgingScanErrorBySegment[segKey] || "");
                          return (
                            <div key={seg.segmentKey} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-sm font-extrabold text-slate-950">{city}</div>
                                  <div className="mt-0.5 text-xs font-semibold text-slate-600">
                                    {seg.nights} noche{seg.nights === 1 ? "" : "s"}
                                    {seg.startDate && seg.endDate ? ` · ${seg.startDate} → ${seg.endDate}` : ""}
                                  </div>
                                </div>
                              </div>

                              <div className="mt-3 flex flex-wrap gap-2">
                                {autoConfig.lodging.mode === "proposal" ? (
                                  <>
                                    <a
                                      href={bookingHotelsUrl({ city, checkin, checkout })}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-700 hover:bg-slate-50"
                                      title="Abrir búsqueda de hoteles en Booking"
                                    >
                                      Ver en Booking
                                    </a>
                                    <a
                                      href={googleHotelsUrl({ city, checkin, checkout })}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-700 hover:bg-slate-50"
                                      title="Abrir búsqueda de hoteles en Google"
                                    >
                                      Ver en Google
                                    </a>
                                  </>
                                ) : null}

                                {autoConfig.lodging.mode === "manual" ? (
                                  <button
                                    type="button"
                                    disabled={loading}
                                    onClick={() => {
                                      setLodgingActionBySegment((p) => ({ ...p, [segKey]: "manual" }));
                                      setLodgingOpenSegment((prev) => (prev === segKey ? null : segKey));
                                    }}
                                    className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                                    title="Añadir alojamiento para este tramo"
                                  >
                                    Añadir alojamiento
                                  </button>
                                ) : null}

                                {autoConfig.lodging.mode === "scan" ? (
                                  <label
                                    className={`inline-flex cursor-pointer items-center justify-center rounded-xl border px-3 py-2 text-xs font-extrabold ${
                                      scanLoading || loading
                                        ? "border-slate-200 bg-white text-slate-400"
                                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                    }`}
                                    title="Escanear un PDF/imagen para rellenar el alojamiento"
                                  >
                                    {scanLoading ? "Escaneando…" : "Escanear documento"}
                                    <input
                                      type="file"
                                      accept=".pdf,image/*"
                                      className="hidden"
                                      disabled={scanLoading || loading}
                                      onChange={(e) => {
                                        const f = e.currentTarget.files?.[0] || null;
                                        e.currentTarget.value = "";
                                        if (!f) return;
                                        void scanLodgingDocumentForSegment({ segmentKey: segKey, file: f });
                                      }}
                                    />
                                  </label>
                                ) : null}
                              </div>

                              {scanError ? (
                                <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
                                  <span className="font-semibold">Error:</span> {scanError}
                                </div>
                              ) : null}

                              {open && (autoConfig.lodging.mode === "manual" || autoConfig.lodging.mode === "scan") ? (
                                <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
                                  <div className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-600">
                                    {action === "scan" ? "Alojamiento (desde documento)" : "Alojamiento (manual)"}
                                  </div>
                                  <div className="mt-3 grid gap-2">
                                    <label className="text-xs font-semibold text-slate-700">
                                      Nombre
                                      <input
                                        value={manual.name}
                                        onChange={(e) =>
                                          setLodgingManualBySegment((p) => ({
                                            ...p,
                                            [segKey]: { ...(p[segKey] || { name: "", address: "", notes: "" }), name: e.target.value },
                                          }))
                                        }
                                        disabled={loading}
                                        className="mt-2 min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 disabled:opacity-60"
                                        placeholder="Ej. Hotel ABC"
                                      />
                                    </label>
                                    <label className="text-xs font-semibold text-slate-700">
                                      Dirección
                                      <input
                                        value={manual.address}
                                        onChange={(e) =>
                                          setLodgingManualBySegment((p) => ({
                                            ...p,
                                            [segKey]: { ...(p[segKey] || { name: "", address: "", notes: "" }), address: e.target.value },
                                          }))
                                        }
                                        disabled={loading}
                                        className="mt-2 min-h-[40px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 disabled:opacity-60"
                                        placeholder="Calle, ciudad, país"
                                      />
                                    </label>
                                    <label className="text-xs font-semibold text-slate-700">
                                      Notas
                                      <textarea
                                        value={manual.notes}
                                        onChange={(e) =>
                                          setLodgingManualBySegment((p) => ({
                                            ...p,
                                            [segKey]: { ...(p[segKey] || { name: "", address: "", notes: "" }), notes: e.target.value },
                                          }))
                                        }
                                        disabled={loading}
                                        rows={3}
                                        className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-60"
                                        placeholder="Código de reserva, notas, etc."
                                      />
                                    </label>
                                    <div className="flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        disabled={loading}
                                        onClick={() => setLodgingOpenSegment(null)}
                                        className="inline-flex min-h-[36px] items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                                      >
                                        Listo
                                      </button>
                                      <button
                                        type="button"
                                        disabled={loading}
                                        onClick={() => {
                                          setLodgingManualBySegment((p) => {
                                            const next = { ...p };
                                            delete next[segKey];
                                            return next;
                                          });
                                          setLodgingActionBySegment((p) => ({ ...p, [segKey]: "none" }));
                                          setLodgingOpenSegment(null);
                                        }}
                                        className="inline-flex min-h-[36px] items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-extrabold text-rose-800 hover:bg-rose-100 disabled:opacity-60"
                                        title="Quitar este alojamiento"
                                      >
                                        Quitar
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                        Aún no se pudieron derivar ciudades/noches (revisa que las direcciones incluyan ciudad y país).
                      </div>
                    )}
                  </div>
                ) : null}

                <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-violet-600"
                    checked={optimizeOrder}
                    disabled={loading}
                    onChange={(e) => {
                      const v = Boolean(e.target.checked);
                      setOptimizeTouched(true);
                      setOptimizeOrder(v);
                      setDraftIntent((prev) => ({ ...(prev || {}), wantsRouteOptimization: v }));
                    }}
                  />
                  <span className="min-w-0">
                    <span className="font-extrabold text-slate-950">Optimizar orden</span>{" "}
                    <span className="text-slate-600">(reduce traslados; desactívalo para respetar tu orden)</span>
                  </span>
                </label>

                <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Cambios para recalcular</div>
                  <p className="mt-1 text-sm text-slate-600">
                    Pide ajustes al asistente (ritmo, traslados, “mete Plitvice en el día de cambio”, “menos museos”, etc.). Se tendrán en cuenta al
                    recalcular planes y al crear el viaje.
                  </p>
                  <textarea
                    value={planChangeNotes}
                    onChange={(e) => setPlanChangeNotes(e.target.value)}
                    rows={3}
                    placeholder="Ej. El día de traslado Zagreb → Split incluye Plitvice en ruta y reduce actividades. No quiero volver a Hvar dos veces."
                    className="mt-3 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                    disabled={loading}
                  />
                  {previewMemory ? (
                    <div className="mt-2 text-xs font-semibold text-slate-500">
                      Hay una previsualización guardada. Pulsa <span className="font-extrabold">Recalcular planes</span> para aplicar cambios.
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => (previewMemory ? openPreviewFromMemory() : void previewPlans())}
                    disabled={loading || !draftIntent}
                    className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-violet-200 bg-violet-50 px-5 py-3 text-sm font-extrabold text-violet-950 shadow-sm hover:bg-violet-100 disabled:opacity-60"
                    title="Ver un calendario de planes propuestos (sin crear el viaje todavía)"
                  >
                    {previewMemory ? "Ver planes" : "Ver previsualización"}
                  </button>
                  {previewMemory ? (
                    <button
                      type="button"
                      onClick={previewPlans}
                      disabled={loading || !draftIntent}
                      className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-extrabold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-60"
                      title="Recalcular planes aplicando los cambios anteriores"
                    >
                      Recalcular planes
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void finalizeCreateTrip({ redirectTo: "participants" })}
                    disabled={loading || creatingTripSilently || !draftIntent}
                    className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-extrabold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
                  >
                    Crear viaje
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push("/dashboard")}
                    disabled={loading}
                    className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-extrabold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            </div>

            <aside className="min-w-0 space-y-4">
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Resumen</div>
                <div className="mt-3 grid gap-2 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-slate-500">Destino</span>
                    <span className="text-right font-extrabold text-slate-950">{destinationLabel || "—"}</span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-slate-500">Fechas</span>
                    <span className="text-right font-semibold text-slate-900">
                      {draftIntent?.startDate && draftIntent?.endDate ? `${draftIntent.startDate} → ${draftIntent.endDate}` : "—"}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-slate-500">Duración</span>
                    <span className="text-right font-semibold text-slate-900">
                      {typeof draftIntent?.durationDays === "number" && draftIntent.durationDays ? `${draftIntent.durationDays} días` : "—"}
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-slate-500">Origen</span>
                    <span className="text-right font-semibold text-slate-900">{(draftIntent?.startLocation || "").trim() || "—"}</span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-slate-500">Fin</span>
                    <span className="text-right font-semibold text-slate-900">{(draftIntent?.endLocation || "").trim() || "—"}</span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-slate-500">Lugares</span>
                    <span className="text-right font-semibold text-slate-900">{derivedPlaces.length ? derivedPlaces.length : "—"}</span>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-slate-500">Optimizar orden</span>
                    <span className="text-right font-semibold text-slate-900">{optimizeOrder ? "Sí" : "No"}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Sugerencias</div>
                <p className="mt-1 text-sm text-slate-600">
                  Ciudades, pueblos, museos o visitas populares para <span className="font-semibold">{destinationLabel || "tu destino"}</span>.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(popularSuggestionsOpen ? popularSuggestions : popularSuggestions.slice(0, 6)).map((x) => (
                    <button
                      key={x}
                      type="button"
                      disabled={loading}
                      onClick={() => addPlaceTag(x)}
                      className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                      title="Añadir a la lista"
                    >
                      + {x}
                    </button>
                  ))}
                  {popularSuggestions.length > 6 ? (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => setPopularSuggestionsOpen((v) => !v)}
                      className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
                      title={popularSuggestionsOpen ? "Ver menos sugerencias" : "Añadir más sugerencias"}
                    >
                      {popularSuggestionsOpen ? "Ver menos" : "Añadir más"}
                    </button>
                  ) : null}
                </div>
              </div>
            </aside>
          </div>
        ) : null}
      </section>

      {previewOpen ? (
        <div
          className="fixed inset-0 z-[1200] flex items-end justify-center bg-slate-950/50 p-4 backdrop-blur-sm sm:items-center"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closePreviewModal();
          }}
        >
          <div className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
              <div className="min-w-0">
                <div className="text-xs font-extrabold uppercase tracking-[0.16em] text-slate-500">Previsualizar planes</div>
                <div className="truncate text-sm font-extrabold text-slate-950">
                  {previewResolved?.destination || destinationLabel || "Viaje"}
                  {previewResolved?.startDate && previewResolved?.endDate ? ` · ${previewResolved.startDate} → ${previewResolved.endDate}` : ""}
                </div>
                {previewResolved?.durationWarning ? (
                  <div className="mt-0.5 text-xs font-semibold text-amber-700">{previewResolved.durationWarning}</div>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-700">
                  Calendario
                </div>
                {previewFast ? (
                  <button
                    type="button"
                    onClick={() => void refinePreviewPlans()}
                    disabled={previewLoading || previewRefineLoading || !draftIntent}
                    className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-extrabold text-violet-950 hover:bg-violet-100 disabled:opacity-60"
                    title="Mejorar el plan con el asistente (puede tardar un poco)"
                  >
                    {previewRefineLoading ? "Mejorando…" : "Mejorar plan"}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={closePreviewModal}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  aria-label="Cerrar"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
            </div>

            <div className="grid max-h-[calc(92vh-60px)] gap-4 overflow-y-auto p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
              <section className="min-w-0 space-y-3">
                {previewLoading ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                    Generando previsualización…
                  </div>
                ) : previewError ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
                    <span className="font-semibold">Error:</span> {previewError}
                  </div>
                ) : previewRefineError ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
                    <span className="font-semibold">Error:</span> {previewRefineError}
                  </div>
                ) : previewItinerary?.days?.length ? (
                  <div className="space-y-3">
                    {previewItinerary.days.map((day, dayIndex) => (
                      <div key={`${day.day}-${day.date}-${dayIndex}`} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                        {(() => {
                          const expanded = previewExpandedDays.has(dayIndex);
                          return (
                            <>
                              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPreviewExpandedDays((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(dayIndex)) next.delete(dayIndex);
                                        else next.add(dayIndex);
                                        return next;
                                      })
                                    }
                                    className="flex min-w-0 flex-1 items-center gap-3 text-left hover:opacity-90"
                                    aria-expanded={expanded}
                                    title={expanded ? "Plegar" : "Desplegar"}
                                  >
                                    <ChevronDown
                                      className={`h-5 w-5 shrink-0 text-slate-500 transition ${expanded ? "rotate-180" : ""}`}
                                      aria-hidden
                                    />
                                    <div className="min-w-0">
                                      <div className="text-sm font-extrabold text-slate-950">
                                        Día {day.day} {day.date ? `· ${day.date}` : ""}
                                      </div>
                                      <div className="text-xs font-semibold text-slate-500">{day.items?.length || 0} planes</div>
                                    </div>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => void openPreviewEditorForAdd(dayIndex, day.date || null)}
                                    className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-extrabold text-violet-950 hover:bg-violet-100"
                                    title="Añadir un plan a este día"
                                  >
                                    <Plus className="h-4 w-4" aria-hidden />
                                    Añadir plan
                                  </button>
                                </div>

                                {expanded ? (
                                  <div className="space-y-2 px-4 py-3">
                            {(day.items || []).map((it, itemIndex) => (
                              <div key={`${dayIndex}-${itemIndex}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                <div className="flex flex-wrap items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="text-sm font-extrabold text-slate-950">
                                      {(it.start_time ? `${it.start_time} · ` : "") + (it.title || "Plan")}
                                    </div>
                                    <div className="mt-1 text-xs text-slate-600">
                                      {(it.place_name || it.address || "").toString() || "—"}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => reorderPreviewItem(dayIndex, itemIndex, -1)}
                                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                                    disabled={itemIndex === 0}
                                    title="Subir"
                                  >
                                    ↑
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => reorderPreviewItem(dayIndex, itemIndex, 1)}
                                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                                    disabled={itemIndex === (day.items?.length || 0) - 1}
                                    title="Bajar"
                                  >
                                    ↓
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => movePreviewItem({ fromDay: dayIndex, fromIndex: itemIndex, toDay: Math.max(0, dayIndex - 1), toIndex: 999 })}
                                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                                    disabled={dayIndex === 0}
                                    title="Mover al día anterior"
                                  >
                                    ← Día
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => movePreviewItem({ fromDay: dayIndex, fromIndex: itemIndex, toDay: Math.min((previewItinerary?.days?.length || 1) - 1, dayIndex + 1), toIndex: 0 })}
                                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                                    disabled={dayIndex === (previewItinerary?.days?.length || 1) - 1}
                                    title="Mover al día siguiente"
                                  >
                                    Día →
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void openPreviewEditorForEdit(dayIndex, itemIndex, day.date || null, it as ItineraryItemPayload)}
                                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-800 hover:bg-slate-50"
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void deletePreviewItem(dayIndex, itemIndex, day.date || null, it as ItineraryItemPayload)}
                                    className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-extrabold text-rose-900 hover:bg-rose-100"
                                    title="Eliminar este plan"
                                  >
                                    <Trash2 className="h-4 w-4" aria-hidden />
                                    Eliminar
                                  </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                            {!day.items?.length ? (
                              <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-600">
                                Sin planes todavía para este día.
                              </div>
                            ) : null}
                                  </div>
                                ) : null}
                              </>
                            );
                        })()}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                    No hay planes para mostrar todavía.
                  </div>
                )}
              </section>

              <aside className="min-w-0 space-y-3">
                {previewEditorError ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
                    <span className="font-semibold">Error:</span> {previewEditorError}
                  </div>
                ) : null}

                {previewEditor ? (
                  <PlanForm
                    saving={previewEditorSaving}
                    premiumEnabled
                    initialData={previewEditor.initialData}
                    onCancelEdit={() => setPreviewEditor(null)}
                    onSubmit={submitPreviewForm}
                  />
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Editor</div>
                    <div className="mt-1 text-xs text-slate-600">
                      Pulsa <span className="font-semibold">Editar</span> o <span className="font-semibold">Añadir plan</span> para abrir aquí el formulario real
                      con autocompletar de dirección y coordenadas.
                    </div>
                  </div>
                )}
              </aside>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

