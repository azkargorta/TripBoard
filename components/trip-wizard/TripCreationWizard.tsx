"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, ChevronRight, Compass, Sparkles, X } from "lucide-react";
import type { TripCreationIntent } from "@/lib/trip-ai/tripCreationTypes";
import type { ExecutableItineraryPayload, ItineraryItemPayload } from "@/lib/trip-ai/tripCreationTypes";

type Props = {
  isPremium: boolean;
  isAdmin?: boolean;
};

type WizardStep = 1 | 2 | 3 | 4 | 5;

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
  resolved: { destination: string; startDate: string; endDate: string; durationDays: number };
  itinerary: ExecutableItineraryPayload;
};

const STEP_LABELS: Array<{ step: WizardStep; label: string }> = [
  { step: 1, label: "Viaje" },
  { step: 2, label: "Planes" },
  { step: 3, label: "Alojamientos" },
  { step: 4, label: "Rutas" },
  { step: 5, label: "Pasajeros" },
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

function clampStep(n: number): WizardStep {
  if (n <= 1) return 1;
  if (n >= 5) return 5;
  return n as WizardStep;
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
    const msg = typeof data?.error === "string" ? data.error : "No se pudo continuar con el asistente.";
    const err = new Error(msg) as Error & { code?: string | null; budget?: any };
    err.code = code;
    err.budget = data?.budget;
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
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewItinerary, setPreviewItinerary] = useState<ExecutableItineraryPayload | null>(null);
  const [previewResolved, setPreviewResolved] = useState<PreviewPlansOk["resolved"] | null>(null);
  const [editing, setEditing] = useState<{
    dayIndex: number;
    itemIndex: number | null;
    values: ItineraryItemPayload;
  } | null>(null);

  const [transportNotes, setTransportNotes] = useState("");
  const [travelersType, setTravelersType] = useState<string>("family");
  const [travelersCount, setTravelersCount] = useState<number | null>(null);
  const [travelerNamesText, setTravelerNamesText] = useState("");

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
    if (step === 4) return true;
    if (step === 5) return Boolean(draftIntent);
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
        return;
      }
      throw new Error("Respuesta inesperada del servidor.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo continuar.");
    } finally {
      setLoading(false);
    }
  }

  async function finalizeCreateTrip() {
    if (loading || !draftIntent) return;
    setLoading(true);
    setError(null);
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
      });

      if (data?.status === "created" || data?.status === "partial") {
        const created = data as ApiCreated;
        router.push(`/trip/${encodeURIComponent(created.tripId)}/summary?recien=1`);
        return;
      }
      if (data?.status === "needs_clarification") {
        const payload = data as ApiNeedsClarification;
        setDraftIntent(payload.draftIntent || null);
        setQuestion(payload.question || "¿Puedes darme un detalle más?");
        setStage("clarifying");
        setStep(1);
        scrollTop();
        return;
      }
      throw new Error("Respuesta inesperada del servidor.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el viaje.");
    } finally {
      setLoading(false);
    }
  }

  async function previewPlans() {
    if (loading || !draftIntent) return;
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewError(null);
    setEditing(null);
    try {
      const res = await fetch("/api/trips/auto-preview-plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "gemini",
          draftIntent: { ...draftIntent, mustSee: derivedPlaces, wantsRouteOptimization: optimizeOrder },
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

  function startAddItem(dayIndex: number) {
    setEditing({
      dayIndex,
      itemIndex: null,
      values: { title: "", activity_kind: "visit", place_name: "", address: "", start_time: "10:00", notes: "" },
    });
  }

  function startEditItem(dayIndex: number, itemIndex: number, item: ItineraryItemPayload) {
    setEditing({
      dayIndex,
      itemIndex,
      values: {
        title: item.title || "",
        activity_kind: item.activity_kind ?? "visit",
        place_name: item.place_name ?? "",
        address: item.address ?? "",
        start_time: item.start_time ?? "",
        notes: item.notes ?? "",
      },
    });
  }

  function deleteItem(dayIndex: number, itemIndex: number) {
    setPreviewItinerary((prev) => {
      if (!prev) return prev;
      const days = prev.days.map((d) => ({ ...d, items: [...(d.items || [])] }));
      const day = days[dayIndex];
      if (!day) return prev;
      day.items.splice(itemIndex, 1);
      return { ...prev, days };
    });
  }

  function saveEditing() {
    if (!editing) return;
    const { dayIndex, itemIndex, values } = editing;
    const title = String(values.title || "").trim();
    if (!title) return;
    setPreviewItinerary((prev) => {
      if (!prev) return prev;
      const days = prev.days.map((d) => ({ ...d, items: [...(d.items || [])] }));
      const day = days[dayIndex];
      if (!day) return prev;
      const normalized: ItineraryItemPayload = {
        title,
        activity_kind: String(values.activity_kind || "visit"),
        place_name: String(values.place_name || "").trim() || null,
        address: String(values.address || "").trim() || null,
        start_time: String(values.start_time || "").trim() || null,
        notes: String(values.notes || "").trim() || null,
      };
      if (itemIndex == null) {
        day.items.push(normalized);
      } else {
        day.items[itemIndex] = normalized;
      }
      day.items.sort((a, b) => String(a.start_time || "").localeCompare(String(b.start_time || "")));
      return { ...prev, days };
    });
    setEditing(null);
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
                  {loading ? "Leyendo…" : "Continuar"}
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
                <div className="text-base font-extrabold text-slate-950">Datos del viaje</div>
                <p className="mt-1 text-sm text-slate-600">
                  Hemos rellenado lo posible. Ajusta lo que necesites y añade los lugares clave del viaje.
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
                    Previsualizar planes
                  </button>
                  <button
                    type="button"
                    onClick={goBack}
                    disabled={loading}
                    className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-extrabold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Ir atrás
                  </button>
                  <button
                    type="button"
                    onClick={goNext}
                    disabled={loading || !draftIntent}
                    className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-extrabold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
                  >
                    Siguiente paso
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

              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-extrabold text-slate-950">Mapa</div>
                    <div className="mt-1 text-xs text-slate-600">Verás el mapa completo cuando el viaje esté creado.</div>
                  </div>
                  <button
                    type="button"
                    disabled
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-extrabold text-slate-500"
                    title="Disponible al crear el viaje"
                  >
                    <Compass className="h-4 w-4" aria-hidden />
                    Mapa
                  </button>
                </div>
              </div>
            </aside>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-base font-extrabold text-slate-950">Alojamientos</div>
            <p className="mt-1 text-sm text-slate-600">
              Aquí te mostraremos las ciudades donde pasas noche y el número de noches. (En esta iteración dejamos la estructura lista.)
            </p>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {["Ciudad 1", "Ciudad 2"].map((city) => (
                <details key={city} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <summary className="cursor-pointer list-none">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-extrabold text-slate-950">{city}</div>
                        <div className="text-xs font-semibold text-slate-600">Noches: —</div>
                      </div>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-extrabold text-slate-700">
                        Abrir
                      </span>
                    </div>
                  </summary>

                  <div className="mt-4 space-y-2">
                    <button
                      type="button"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-extrabold text-slate-800 hover:bg-slate-50"
                    >
                      Añadir alojamiento manual
                    </button>
                    <button
                      type="button"
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-extrabold text-slate-800 hover:bg-slate-50"
                    >
                      Escanear reserva
                    </button>
                    <button
                      type="button"
                      className="w-full rounded-2xl bg-slate-950 px-4 py-3 text-sm font-extrabold text-white hover:bg-slate-800"
                    >
                      Propuesta de alojamiento
                    </button>
                  </div>
                </details>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={goBack}
                disabled={loading}
                className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-extrabold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
              >
                Ir atrás
              </button>
              <button
                type="button"
                onClick={goNext}
                disabled={loading}
                className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-extrabold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
              >
                Siguiente paso
              </button>
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-base font-extrabold text-slate-950">Rutas</div>
            <p className="mt-1 text-sm text-slate-600">
              Dime qué tipo de transporte quieres. Puedes especificar reglas por duración u hora, y también excepciones para una ruta concreta.
            </p>

            <textarea
              value={transportNotes}
              onChange={(e) => setTransportNotes(e.target.value)}
              rows={4}
              disabled={loading}
              placeholder="Ej.: Dentro de ciudad a pie + metro. Traslados entre ciudades en tren. Si la ruta supera 3h, avión. De noche, taxi."
              className="mt-4 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
            />

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={goBack}
                disabled={loading}
                className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-extrabold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
              >
                Ir atrás
              </button>
              <button
                type="button"
                onClick={goNext}
                disabled={loading}
                className="inline-flex min-h-11 items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-extrabold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
              >
                Siguiente paso
              </button>
            </div>
          </div>
        ) : null}

        {step === 5 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-base font-extrabold text-slate-950">Pasajeros</div>
            <p className="mt-1 text-sm text-slate-600">
              Configura quién viaja. Al finalizar crearemos el viaje y entraremos al resumen.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Tipo</span>
                <select
                  value={travelersType}
                  onChange={(e) => setTravelersType(e.target.value)}
                  disabled={loading}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
                >
                  <option value="family">Familia</option>
                  <option value="couple">Pareja</option>
                  <option value="friends">Amigos</option>
                  <option value="solo">Solo</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Número (opcional)</span>
                <input
                  type="number"
                  min={1}
                  value={travelersCount ?? ""}
                  onChange={(e) => {
                    const n = Number.parseInt(e.target.value, 10);
                    setTravelersCount(Number.isFinite(n) && n > 0 ? n : null);
                  }}
                  disabled={loading}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
                  placeholder="Ej. 4"
                />
              </label>
            </div>

            <label className="mt-4 block space-y-1">
              <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Nombres (opcional)</span>
              <textarea
                value={travelerNamesText}
                onChange={(e) => setTravelerNamesText(e.target.value)}
                rows={3}
                disabled={loading}
                placeholder="Ej.: Ana, Luis, Martina, Pablo"
                className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-slate-50"
              />
            </label>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={goBack}
                disabled={loading}
                className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-extrabold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
              >
                Ir atrás
              </button>
              <button
                type="button"
                onClick={finalizeCreateTrip}
                disabled={loading || !draftIntent}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-violet-600 px-5 py-3 text-sm font-extrabold text-white shadow-sm hover:bg-violet-700 disabled:opacity-60"
              >
                <Sparkles className="h-4 w-4" aria-hidden />
                {loading ? "Creando…" : "Finalizar"}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {previewOpen ? (
        <div
          className="fixed inset-0 z-[1200] flex items-end justify-center bg-slate-950/50 p-4 backdrop-blur-sm sm:items-center"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPreviewOpen(false);
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
              </div>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
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
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                          <div className="min-w-0">
                            <div className="text-sm font-extrabold text-slate-950">
                              Día {day.day} {day.date ? `· ${day.date}` : ""}
                            </div>
                            <div className="text-xs font-semibold text-slate-500">{day.items?.length || 0} planes</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => startAddItem(dayIndex)}
                            className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-800 hover:bg-slate-50"
                          >
                            + Añadir plan
                          </button>
                        </div>
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
                                    onClick={() => startEditItem(dayIndex, itemIndex, it)}
                                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-extrabold text-slate-700 hover:bg-slate-50"
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => deleteItem(dayIndex, itemIndex)}
                                    className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-extrabold text-rose-900 hover:bg-rose-100"
                                  >
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
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Edición</div>
                  <div className="mt-1 text-xs text-slate-600">
                    Los cambios aquí son una previsualización. (En la siguiente iteración los aplicaremos a la creación final.)
                  </div>
                </div>

                {editing ? (
                  <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
                    <div className="text-sm font-extrabold text-violet-950">
                      {editing.itemIndex == null ? "Nuevo plan" : "Editar plan"}
                    </div>
                    <div className="mt-3 grid gap-3">
                      <label className="space-y-1">
                        <span className="text-xs font-extrabold text-slate-700">Título</span>
                        <input
                          value={editing.values.title}
                          onChange={(e) => setEditing((p) => (p ? { ...p, values: { ...p.values, title: e.target.value } } : p))}
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-violet-200"
                        />
                      </label>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="space-y-1">
                          <span className="text-xs font-extrabold text-slate-700">Hora</span>
                          <input
                            value={String(editing.values.start_time || "")}
                            onChange={(e) =>
                              setEditing((p) => (p ? { ...p, values: { ...p.values, start_time: e.target.value } } : p))
                            }
                            placeholder="10:00"
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-violet-200"
                          />
                        </label>
                        <label className="space-y-1">
                          <span className="text-xs font-extrabold text-slate-700">Tipo</span>
                          <select
                            value={String(editing.values.activity_kind || "visit")}
                            onChange={(e) =>
                              setEditing((p) => (p ? { ...p, values: { ...p.values, activity_kind: e.target.value } } : p))
                            }
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-violet-200"
                          >
                            <option value="visit">Visita</option>
                            <option value="museum">Museo</option>
                            <option value="food">Comida</option>
                            <option value="activity">Actividad</option>
                            <option value="transport">Transporte</option>
                            <option value="shopping">Compras</option>
                            <option value="nightlife">Noche</option>
                          </select>
                        </label>
                      </div>
                      <label className="space-y-1">
                        <span className="text-xs font-extrabold text-slate-700">Lugar visible</span>
                        <input
                          value={String(editing.values.place_name || "")}
                          onChange={(e) =>
                            setEditing((p) => (p ? { ...p, values: { ...p.values, place_name: e.target.value } } : p))
                          }
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-violet-200"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-extrabold text-slate-700">Dirección</span>
                        <input
                          value={String(editing.values.address || "")}
                          onChange={(e) =>
                            setEditing((p) => (p ? { ...p, values: { ...p.values, address: e.target.value } } : p))
                          }
                          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-violet-200"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="text-xs font-extrabold text-slate-700">Notas</span>
                        <textarea
                          value={String(editing.values.notes || "")}
                          onChange={(e) =>
                            setEditing((p) => (p ? { ...p, values: { ...p.values, notes: e.target.value } } : p))
                          }
                          rows={3}
                          className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-violet-200"
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={saveEditing}
                          className="inline-flex min-h-10 items-center justify-center rounded-2xl bg-slate-950 px-4 py-2 text-xs font-extrabold text-white hover:bg-slate-800"
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditing(null)}
                          className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-extrabold text-slate-800 hover:bg-slate-50"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                    Pulsa <span className="font-semibold">Editar</span> en un plan o <span className="font-semibold">Añadir plan</span> en un día.
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

