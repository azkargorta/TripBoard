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

type WizardStep = 1 | 2;

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

const STEP_LABELS: Array<{ step: WizardStep; label: string }> = [
  { step: 1, label: "Describe" },
  { step: 2, label: "Revisión" },
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
  if (has("italia") || has("italy")) {
    return ["Roma", "Florencia", "Venecia", "Milán", "Pompeya", "Vaticano", "Uffizi", "Trastevere", "Cinque Terre"];
  }
  if (has("francia") || has("france") || has("paris") || has("parís")) {
    return ["París", "Louvre", "Torre Eiffel", "Montmartre", "Versalles", "Sena", "Museo d'Orsay", "Notre-Dame"];
  }
  if (has("japon") || has("japón") || has("japan") || has("tokyo") || has("tokio") || has("kyoto") || has("kioto")) {
    return ["Tokio", "Kioto", "Osaka", "Nara", "Shibuya", "Fushimi Inari", "Arashiyama", "Dotonbori"];
  }
  if (has("croacia") || has("croatia")) {
    return ["Dubrovnik", "Split", "Zadar", "Hvar", "Lagos de Plitvice", "Trogir"];
  }
  if (has("portugal")) {
    return ["Lisboa", "Oporto", "Sintra", "Belém", "Ribeira", "Cascais", "Braga"];
  }
  if (has("polonia") || has("poland")) {
    return ["Cracovia", "Auschwitz", "Gdansk", "Varsovia", "Wroclaw", "Zakopane"];
  }
  return ["Centro histórico", "Mirador", "Mercado local", "Museo principal", "Barrio gastronómico", "Excursión cercana"];
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
  const [places, setPlaces] = useState<string[]>([]);
  const [placeAdd, setPlaceAdd] = useState("");
  const [optimizeOrder, setOptimizeOrder] = useState(true);
  const [optimizeTouched, setOptimizeTouched] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewItinerary, setPreviewItinerary] = useState<ExecutableItineraryPayload | null>(null);
  const [previewResolved, setPreviewResolved] = useState<PreviewPlansOk["resolved"] | null>(null);
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

  const [transportNotes, setTransportNotes] = useState("");
  const [travelersType, setTravelersType] = useState<string>("family");
  const [travelersCount, setTravelersCount] = useState<number | null>(null);
  const [travelerNamesText, setTravelerNamesText] = useState("");
  const [createdTripId, setCreatedTripId] = useState<string | null>(null);
  const [createdTripPartialError, setCreatedTripPartialError] = useState<string | null>(null);
  const [creatingTripSilently, setCreatingTripSilently] = useState(false);
  const [autoConfig, setAutoConfig] = useState<TripAutoConfig>(() => DEFAULT_TRIP_AUTO_CONFIG);

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
    if (step === 1) return Boolean(prompt.trim());
    if (step === 2) return Boolean(draftIntent);
    return true;
  }, [draftIntent, loading, prompt, step]);

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

  const promptForAi = useMemo(() => {
    const base = prompt.trim();
    if (!tripIdeas.size) return base;
    const extras = Array.from(tripIdeas.values());
    // Lo añadimos como una línea extra para dar contexto sin “ensuciar” el texto original.
    return base ? `${base}\n\nIdeas/estilo: ${extras.join(" · ")}` : `Ideas/estilo: ${extras.join(" · ")}`;
  }, [prompt, tripIdeas]);

  useEffect(() => {
    if (step !== 2) return;
    if (!draftIntent) return;
    // Asegura que "Optimizar orden" esté activado por defecto (si el usuario no lo ha tocado).
    if (!optimizeTouched) {
      setOptimizeOrder(true);
      setDraftIntent((prev) => ({ ...(prev || {}), wantsRouteOptimization: true }));
    }
  }, [draftIntent, optimizeTouched, step]);

  async function ensureLodgingItinerary() {
    if (!draftIntent || lodgingLoading) return;
    if (autoConfig.lodging.mode === "omit") return;
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

  const lodgingCities = useMemo(() => {
    const itin = lodgingItinerary;
    if (!itin?.days?.length) return [];

    const addDays = (isoDate: string, days: number) => {
      const d = new Date(`${isoDate}T12:00:00`);
      if (Number.isNaN(d.getTime())) return isoDate;
      d.setDate(d.getDate() + days);
      return d.toISOString().slice(0, 10);
    };

    type LodgingSeg = {
      segmentKey: string;
      city: string;
      nights: number;
      dates: string[];
      startDate: string | null;
      endDate: string | null;
    };

    const sortedDays = [...itin.days]
      .filter((d) => typeof d?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.date))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));

    const segments: LodgingSeg[] = [];
    let current: LodgingSeg | null = null;

    for (const day of sortedDays) {
      const items = day.items || [];
      const lodgingItem =
        items.find((it) => String(it.activity_kind || "").toLowerCase() === "lodging") ||
        items.find((it) => /check[-\s]?in|hotel|aloj/i.test(String(it.title || ""))) ||
        null;
      const addr = String(lodgingItem?.address || "").trim();
      const city =
        cityFromAddress(addr) || cityFromAddress(String(items[items.length - 1]?.address || "")) || "Sin ciudad";

      // Tramos consecutivos por ciudad: si vuelves a la misma ciudad más tarde en el viaje, es otro tramo (otro check-in).
      if (!current || current.city !== city) {
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
  }, [lodgingItinerary]);

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
    if ((loading || creatingTripSilently) || !draftIntent) return null;
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

      const data = await callAutoCreate({
        followUp: mergedFollowUp,
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

        // Guardar alojamientos elegidos en el wizard como actividades "lodging" en BD.
        // (Antes se quedaban solo en estado local y se perdían al crear el viaje).
        if (!silent && lodgingCities.length) {
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
        }

        const redirectTo = options?.redirectTo ?? "participants";
        if (redirectTo === "summary") {
          router.push(`/trip/${encodeURIComponent(created.tripId)}/summary?recien=1`);
        } else if (redirectTo === "participants") {
          router.push(`/trip/${encodeURIComponent(created.tripId)}/participants?recien=1`);
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
    setPreviewExpandedDays(new Set());
    setPreviewEditor(null);
    setPreviewEditorError(null);
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
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "No se pudo previsualizar los planes.");
      if (data?.status !== "ok" || !data?.itinerary) throw new Error("Respuesta inesperada del servidor.");
      setPreviewResolved(data.resolved || null);
      setPreviewItinerary(data.itinerary || null);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : "No se pudo previsualizar los planes.");
      setPreviewItinerary(null);
      setPreviewResolved(null);
    } finally {
      setPreviewLoading(false);
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
                <Sparkles className="h-5 w-5" aria-hidden />
              </div>
              <div className="min-w-0">
                <div className="text-base font-extrabold text-slate-950">Cuéntame sobre tu viaje</div>
                <p className="mt-1 text-sm text-slate-600">
                  Escríbelo como si se lo contaras a un amigo. Luego lo convertimos en un borrador editable.
                </p>
              </div>
            </div>

            {stage === "clarifying" ? (
              <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 p-4">
                <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-violet-800">Solo una pregunta más</div>
                <div className="mt-1 text-sm font-semibold text-slate-950">{question}</div>
              </div>
            ) : null}

            <div className="mt-4 space-y-3">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={5}
                disabled={loading}
                placeholder={PROMPT_EXAMPLE}
                className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
              />

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-600">
                      Ideas de tipos de viaje
                    </div>
                    <div className="mt-1 text-xs text-slate-600">
                      Selecciona varias para guiar al asistente (se añaden como contexto).
                    </div>
                  </div>
                  {tripIdeas.size ? (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => setTripIdeas(new Set())}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-extrabold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      title="Limpiar selección"
                    >
                      Limpiar ({tripIdeas.size})
                    </button>
                  ) : null}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {TRIP_IDEAS.map((idea) => {
                    const active = tripIdeas.has(idea);
                    return (
                      <button
                        key={idea}
                        type="button"
                        disabled={loading}
                        onClick={() =>
                          setTripIdeas((prev) => {
                            const next = new Set(prev);
                            if (next.has(idea)) next.delete(idea);
                            else next.add(idea);
                            return next;
                          })
                        }
                        className={`rounded-full border px-3 py-2 text-xs font-extrabold transition disabled:opacity-60 ${
                          active
                            ? "border-violet-300 bg-violet-50 text-violet-950"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                        aria-pressed={active}
                        title={active ? "Quitar" : "Añadir"}
                      >
                        {idea}
                      </button>
                    );
                  })}
                </div>
              </div>

              {stage === "clarifying" ? (
                <input
                  value={followUp}
                  onChange={(e) => setFollowUp(e.target.value)}
                  disabled={loading}
                  placeholder="Responde aquí…"
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
                />
              ) : null}

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={stage === "clarifying" ? step1Clarify : step1Preview}
                  disabled={loading || (stage === "clarifying" ? !followUp.trim() : !prompt.trim())}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
                >
                  <Check className="h-4 w-4" aria-hidden />
                  {loading ? "Generando…" : "Generar viaje"}
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
        ) : null}

        {step === 2 ? (
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
                      onChange={(e) =>
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
                      onChange={(e) =>
                        setDraftIntent((prev) => ({ ...(prev || {}), endLocation: e.target.value.trim() || null }))
                      }
                      disabled={loading}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
                    />
                  </label>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
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
                          disabled={loading}
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
                          disabled={loading}
                          inputMode="numeric"
                          className="w-20 shrink-0 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
                        />
                        <span className="text-[11px] font-semibold text-slate-500">recomendado: 3–5</span>
                      </div>
                    </label>

                    <label className="space-y-1">
                      <span className="text-xs font-extrabold text-slate-700">Coherencia geográfica</span>
                      <select
                        value={autoConfig.geo.strictness}
                        onChange={(e) =>
                          setAutoConfig((p) => ({ ...p, geo: { ...p.geo, strictness: e.target.value as any } }))
                        }
                        disabled={loading}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
                      >
                        <option value="balanced">Equilibrada</option>
                        <option value="strict">Muy estricta</option>
                        <option value="loose">Flexible</option>
                      </select>
                    </label>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="text-xs font-extrabold text-slate-700">Generación</div>
                      <div className="mt-1 text-xs font-semibold text-slate-600">
                        Se generarán planes para <span className="font-extrabold text-slate-900">todos los días</span> del viaje.
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-3 grid-cols-1 lg:grid-cols-2">
                    <label className="space-y-1 lg:col-span-2">
                      <span className="text-xs font-extrabold text-slate-700">Preferencias de transporte y rutas</span>
                      <textarea
                        value={autoConfig.transport.notes}
                        onChange={(e) => setAutoConfig((p) => ({ ...p, transport: { ...p.transport, notes: e.target.value } }))}
                        disabled={loading}
                        rows={4}
                        placeholder="Ej.\n- Dentro de ciudad: a pie + metro\n- Entre ciudades: tren\n- Islas: ferry\n- Si una ruta supera 3h: vuelo\n- Por la noche: taxi"
                        className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
                      />
                      <div className="text-[11px] font-semibold text-slate-500">
                        Puedes escribir reglas por duración (“&gt; 3h”), por tipo de trayecto (ciudad vs interurbano) y excepciones.
                      </div>
                    </label>

                    <label className="space-y-1">
                      <span className="text-xs font-extrabold text-slate-700">Alojamiento</span>
                      <select
                        value={autoConfig.lodging.mode}
                        onChange={(e) => setAutoConfig((p) => ({ ...p, lodging: { ...p.lodging, mode: e.target.value as any } }))}
                        disabled={loading}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
                      >
                        <option value="proposal">Propuesta</option>
                        <option value="manual">Manual</option>
                        <option value="omit">Omitir</option>
                      </select>
                      <div className="text-[11px] font-semibold text-slate-500">
                        {autoConfig.lodging.mode === "omit"
                          ? "No se sugerirán alojamientos automáticamente."
                          : autoConfig.lodging.mode === "manual"
                            ? "Podrás añadir alojamientos manualmente después de crear el viaje."
                            : "Se sugerirán alojamientos (puedes cambiarlos después)."}
                      </div>
                    </label>

                    <label className="space-y-1">
                      <span className="text-xs font-extrabold text-slate-700">Ciudad base de alojamiento</span>
                      <select
                        value={autoConfig.lodging.baseCityMode}
                        onChange={(e) =>
                          setAutoConfig((p) => ({ ...p, lodging: { ...p.lodging, baseCityMode: e.target.value as any } }))
                        }
                        disabled={loading}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
                      >
                        <option value="rotate">Rotar entre ciudades</option>
                        <option value="single">Siempre la misma ciudad</option>
                      </select>
                      {autoConfig.lodging.baseCityMode === "single" ? (
                        <input
                          value={autoConfig.lodging.baseCity}
                          onChange={(e) => setAutoConfig((p) => ({ ...p, lodging: { ...p.lodging, baseCity: e.target.value } }))}
                          disabled={loading}
                          placeholder="Ej. Zagreb"
                          className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
                        />
                      ) : (
                        <div className="text-[11px] font-semibold text-slate-500">El asistente repartirá días por ciudades para reducir traslados.</div>
                      )}
                    </label>
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

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={previewPlans}
                    disabled={loading || !draftIntent}
                    className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-violet-200 bg-violet-50 px-5 py-3 text-sm font-extrabold text-violet-950 shadow-sm hover:bg-violet-100 disabled:opacity-60"
                    title="Ver un calendario de planes propuestos (sin crear el viaje todavía)"
                  >
                    Ver previsualización
                  </button>
                  <button
                    type="button"
                    onClick={() => void finalizeCreateTrip({ redirectTo: "participants" })}
                    disabled={loading || !draftIntent}
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
                  {popularSuggestions.map((x) => (
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

