"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import TripPlacesFields from "@/components/dashboard/TripPlacesFields";
import { joinTripPlaces } from "@/lib/trip-places";
import { useToast } from "@/components/ui/toast";
import PlanActivityCard from "@/components/trip/plan/PlanActivityCard";
import {
  ArrowRight,
  Sparkles,
  Calendar,
  MapPin,
  MessageCircle,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Send,
  CheckCircle2,
  Loader2,
  Wand2,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Category =
  | "culture"
  | "nature"
  | "viewpoint"
  | "neighborhood"
  | "market"
  | "excursion"
  | "gastro_experience"
  | "shopping"
  | "night"
  | "transport";

type Poi = { name: string; lat: number; lng: number; osm?: { type: string; id: string } };

type DraftDayItem = {
  title: string;
  description: string | null;
  activity_date: string;
  activity_time: string | null;
  place_name: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  activity_kind: Category;
  activity_type: string | null;
  source: string | null;
};

type DraftDay = { day: number; date: string; base: string; items: DraftDayItem[] };
type StayRow = { stop: string; nights: number };

type ApiDraft = {
  totalDays: number;
  startDate: string;
  endDate: string;
  destinations: string[];
  stays: StayRow[];
  baseCityByDay: string[];
  suggestions: Record<string, Array<{ category: Exclude<Category, "transport">; pois: Poi[] }>>;
  days: DraftDay[];
};

type ChatMessage = {
  role: "user" | "assistant";
  text: string;
};

type CurrencyCode = "EUR" | "USD" | "GBP" | "ARS" | "MXN" | "CLP" | "BRL" | "JPY" | "CAD" | "AUD" | "CHF";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isoOk(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function totalDaysBetween(start: string, end: string) {
  if (!isoOk(start) || !isoOk(end)) return 1;
  const a = new Date(`${start}T12:00:00Z`).getTime();
  const b = new Date(`${end}T12:00:00Z`).getTime();
  return Math.max(1, Math.round((b - a) / (86400 * 1000)) + 1);
}

function stableId(day: number, idx: number) {
  return `draft-${day}-${idx}`;
}

function inferCurrencyFromDestinations(destinations: string[]): CurrencyCode {
  const blob = destinations.join(" · ").toLowerCase();
  if (/\b(argentina|buenos aires|mendoza|bariloche|salta|ushuaia)\b/i.test(blob)) return "ARS";
  if (/\b(chile|santiago|valpara[ií]so|atacama)\b/i.test(blob)) return "CLP";
  if (/\b(m[eé]xico|mexico|cdmx|canc[uú]n|oaxaca)\b/i.test(blob)) return "MXN";
  if (/\b(brasil|brazil|rio de janeiro|s[aã]o paulo)\b/i.test(blob)) return "BRL";
  if (/\b(eeuu|usa|united states|new york|miami|los angeles)\b/i.test(blob)) return "USD";
  if (/\b(reino unido|uk|united kingdom|londres|london)\b/i.test(blob)) return "GBP";
  if (/\b(jap[oó]n|japan|tokyo|kyoto|osaka)\b/i.test(blob)) return "JPY";
  if (/\b(canad[aá]|canada|toronto|vancouver)\b/i.test(blob)) return "CAD";
  if (/\b(australia|sydney|melbourne)\b/i.test(blob)) return "AUD";
  if (/\b(suiza|switzerland|z[uú]rich)\b/i.test(blob)) return "CHF";
  return "EUR";
}

const CATEGORY_KINDS = [
  { key: "culture" as const, label: "Cultura", emoji: "🏛️", color: "#f59e0b" },
  { key: "nature" as const, label: "Naturaleza", emoji: "🌿", color: "#10b981" },
  { key: "viewpoint" as const, label: "Mirador", emoji: "🌄", color: "#0ea5e9" },
  { key: "neighborhood" as const, label: "Barrio", emoji: "🧭", color: "#64748b" },
  { key: "market" as const, label: "Mercado", emoji: "🧺", color: "#f97316" },
  { key: "excursion" as const, label: "Excursión", emoji: "🚌", color: "#2563eb" },
  { key: "gastro_experience" as const, label: "Gastronomía", emoji: "🍷", color: "#db2777" },
  { key: "shopping" as const, label: "Compras", emoji: "🛍️", color: "#a855f7" },
  { key: "night" as const, label: "Noche", emoji: "🌙", color: "#334155" },
];

// Frases de intro por día generadas localmente a partir del borrador
function dayIntroPhrase(day: DraftDay): string {
  const kindCounts: Record<string, number> = {};
  for (const it of day.items) {
    const k = it.activity_kind || "visit";
    kindCounts[k] = (kindCounts[k] || 0) + 1;
  }
  const dominant = Object.entries(kindCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const city = day.base;
  const n = day.items.length;

  const phrases: Record<string, string> = {
    culture: `Un día cargado de historia y arte en ${city}. ${n} parada${n !== 1 ? "s" : ""} para empaparte de cultura.`,
    nature: `Jornada al aire libre cerca de ${city}. Espacios naturales y vistas que valen el madrugón.`,
    viewpoint: `Los mejores miradores de ${city} en un solo día. Lleva la cámara.`,
    gastro_experience: `${city} tiene una escena gastronómica increíble — este día está pensado para saborearla.`,
    market: `Mercados, sabores locales y el pulso del día a día de ${city}.`,
    excursion: `Excursión desde ${city}. Un día fuera de la ciudad que no está en ninguna guía genérica.`,
    neighborhood: `Explora los barrios con más carácter de ${city}: calles, tiendas y rincones auténticos.`,
    night: `La tarde-noche en ${city} tiene su propio ritmo. ${n} plan${n !== 1 ? "es" : ""} para vivirla bien.`,
    transport: `Día de traslado. El viaje también es parte del viaje.`,
  };

  return phrases[dominant ?? "culture"] ?? `${n} plan${n !== 1 ? "es" : ""} en ${city}.`;
}

// Sugerencias de chat predefinidas
const CHAT_SUGGESTIONS = [
  "Menos museos, más vida local",
  "Añade más gastronomía",
  "Ritmo más tranquilo",
  "Más actividades al aire libre",
  "Incluye opciones para tarde-noche",
  "Quita las actividades de compras",
  "Ponlo todo más compacto geográficamente",
  "Más cultura e historia",
];

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function GeneratingSkeleton() {
  const steps = [
    { icon: "🗺️", label: "Localizando puntos de interés reales…" },
    { icon: "📅", label: "Distribuyendo actividades por días…" },
    { icon: "⏱️", label: "Ajustando horarios y ritmo…" },
    { icon: "✅", label: "Revisando coherencia geográfica…" },
  ];
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setActive((p) => (p + 1) % steps.length), 1800);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="card-soft p-10 flex flex-col items-center justify-center gap-6 min-h-[300px]">
      <div className="relative">
        <div className="w-16 h-16 rounded-full border-4 border-violet-100 border-t-violet-500 animate-spin" />
        <Wand2 className="absolute inset-0 m-auto w-6 h-6 text-violet-500" />
      </div>
      <div className="text-center space-y-1">
        <p className="text-base font-bold text-slate-900">Generando tu itinerario…</p>
        <p className="text-sm font-medium text-slate-500 transition-all">{steps[active]?.icon} {steps[active]?.label}</p>
      </div>
      <div className="flex gap-1.5">
        {steps.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all duration-500 ${i === active ? "w-6 bg-violet-500" : "w-1.5 bg-slate-200"}`}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TripAiPlannerWizard() {
  const router = useRouter();
  const toast = useToast();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  // Step: "form" → "generating" → "preview"
  const [step, setStep] = useState<"form" | "generating" | "preview">("form");

  // Form fields
  const [places, setPlaces] = useState<string[]>([""]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [freeText, setFreeText] = useState("");
  const [tripName, setTripName] = useState("");

  // Draft state
  const [draft, setDraft] = useState<ApiDraft | null>(null);
  const [stays, setStays] = useState<StayRow[]>([]);

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [activeRules, setActiveRules] = useState<string[]>([]);

  // UI state
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set([1]));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Derived
  const totalDays = useMemo(() => totalDaysBetween(startDate, endDate), [startDate, endDate]);
  const destinationLabel = useMemo(() => joinTripPlaces(places.map((x) => x.trim()).filter(Boolean)), [places]);
  const inferredCurrency = useMemo(() => inferCurrencyFromDestinations(places.map((x) => x.trim()).filter(Boolean)), [places]);

  const canGenerate = useMemo(() => {
    const list = places.map((x) => x.trim()).filter(Boolean);
    return list.length > 0 && isoOk(startDate) && isoOk(endDate) && endDate >= startDate;
  }, [places, startDate, endDate]);

  useEffect(() => {
    if (!isoOk(startDate)) return;
    if (!endDate || endDate < startDate) setEndDate(startDate);
  }, [startDate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // ── Generate draft ─────────────────────────────────────────────────────────

  async function generateDraft(opts?: { targetDayNums?: number[] | null; regenerateBadOnly?: boolean }) {
    const list = places.map((x) => x.trim()).filter(Boolean);
    setError(null);
    setStep("generating");

    try {
      const res = await fetch("/api/trips/ai-planner/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destinations: list,
          start_date: startDate,
          end_date: endDate,
          stays: stays.length ? stays : undefined,
          days: draft?.days || undefined,
          regenerateBadOnly: Boolean(opts?.regenerateBadOnly),
          targetDayNums: Array.isArray(opts?.targetDayNums) ? opts!.targetDayNums : undefined,
          rules: activeRules,
          freeText: freeText.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "No se pudo generar el itinerario.");

      setDraft(data as ApiDraft);
      setStays(Array.isArray((data as any)?.stays) ? (data as any).stays : []);
      setExpandedDays(new Set([1]));
      setStep("preview");

      if (!chatMessages.length) {
        setChatMessages([
          {
            role: "assistant",
            text: `He generado un itinerario de ${(data as ApiDraft).totalDays} días con lugares reales. ¿Quieres ajustar algo? Puedes pedirme cambios concretos: quitar un tipo de actividad, añadir más gastronomía, cambiar el ritmo…`,
          },
        ]);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo generar el itinerario.";
      setError(msg);
      setStep(draft ? "preview" : "form");
      toast.error("Error al generar", msg);
    }
  }

  // ── Chat / refine ──────────────────────────────────────────────────────────

  async function sendChat(text?: string) {
    const msg = (text ?? chatInput).trim();
    if (!msg || !draft) return;
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", text: msg }]);
    setActiveRules((prev) => [...prev, msg].slice(-12));
    setChatLoading(true);

    // Optimistic assistant reply
    setChatMessages((prev) => [
      ...prev,
      { role: "assistant", text: "Entendido, voy a actualizar el itinerario con eso en mente…" },
    ]);

    try {
      await generateDraft({ regenerateBadOnly: false });
    } finally {
      setChatLoading(false);
    }
  }

  // ── Create trip ────────────────────────────────────────────────────────────

  async function createTripFromDraft() {
    if (!draft) return;
    const name = (tripName.trim() || `${destinationLabel} (${startDate} → ${endDate})`).trim();
    setSaving(true);
    setError(null);

    try {
      const createRes = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          destination: destinationLabel,
          start_date: startDate,
          end_date: endDate,
          base_currency: inferredCurrency,
        }),
      });
      const createPayload = await createRes.json().catch(() => null);
      if (!createRes.ok) throw new Error(createPayload?.error || "No se pudo crear el viaje.");
      const tripId = String(createPayload?.tripId || "");
      if (!tripId) throw new Error("No se pudo crear el viaje.");

      // Create activity kinds
      for (const k of CATEGORY_KINDS) {
        await fetch("/api/trip-activity-kinds", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tripId, kind_key: k.key, label: k.label, emoji: k.emoji, color: k.color }),
        }).catch(() => null);
      }

      const bulk = draft.days.flatMap((d) =>
        (d.items || []).map((it) => ({
          title: it.title,
          description: it.description,
          activity_date: it.activity_date,
          activity_time: it.activity_time,
          place_name: it.place_name,
          address: it.address,
          latitude: it.latitude,
          longitude: it.longitude,
          activity_type: it.activity_type,
          activity_kind: it.activity_kind,
          source: "ai_planner",
        }))
      );

      const bulkRes = await fetch("/api/trip-activities/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, activities: bulk }),
      });
      if (!bulkRes.ok) {
        const p = await bulkRes.json().catch(() => null);
        throw new Error(p?.error || "No se pudieron crear los planes.");
      }

      toast.success("¡Viaje creado!", "Tu itinerario está listo en el panel de plan.");
      router.push(`/trip/${encodeURIComponent(tripId)}/plan`);
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo crear el viaje.";
      setError(msg);
      toast.error("Error", msg);
    } finally {
      setSaving(false);
    }
  }

  // ── Toggle day expand ──────────────────────────────────────────────────────

  function toggleDay(day: number) {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-1">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-5 h-5 text-violet-500" />
            <span className="text-xs font-bold uppercase tracking-widest text-violet-600">Premium · IA</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Planificador inteligente</h1>
          <p className="mt-1.5 text-sm font-medium text-slate-500 max-w-md">
            Describe tu viaje con lo mínimo — destino, fechas y tus preferencias — y la IA genera un itinerario real que puedes refinar por chat.
          </p>
        </div>
      </div>

      {/* ── Error banner ────────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 flex items-start gap-2">
          <span className="mt-0.5">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* ── FORM STEP ────────────────────────────────────────────────────────── */}
      {step === "form" && (
        <div className="card-soft p-7 space-y-6">
          {/* Destinos */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-bold text-slate-800">¿A dónde vas?</span>
            </div>
            <TripPlacesFields places={places} onChange={setPlaces} />
          </div>

          {/* Fechas */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-bold text-slate-800">¿Cuándo?</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">Fecha de inicio</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500 bg-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">
                  Fecha de fin
                  {isoOk(startDate) && isoOk(endDate) && (
                    <span className="ml-2 text-violet-600 font-bold">{totalDays} días</span>
                  )}
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate || undefined}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500 bg-white"
                />
              </div>
            </div>
          </div>

          {/* Preferencias (texto libre) */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <MessageCircle className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-bold text-slate-800">¿Alguna preferencia? <span className="text-slate-400 font-normal">(opcional)</span></span>
            </div>
            <textarea
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              rows={3}
              placeholder="Ej: viajamos en pareja, nos gusta la gastronomía local, sin museos, ritmo tranquilo, presupuesto medio…"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500 bg-white resize-none"
            />
            {/* Chips de ejemplos */}
            <div className="mt-2 flex flex-wrap gap-2">
              {["Sin museos", "Gastronomía local", "Ritmo tranquilo", "Con niños", "Presupuesto ajustado", "Mucha naturaleza"].map((hint) => (
                <button
                  key={hint}
                  type="button"
                  onClick={() => setFreeText((prev) => prev ? `${prev}, ${hint.toLowerCase()}` : hint.toLowerCase())}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                >
                  {hint}
                </button>
              ))}
            </div>
          </div>

          {/* CTA */}
          <button
            type="button"
            disabled={!canGenerate}
            onClick={() => generateDraft()}
            className="btn-primary w-full flex items-center justify-center gap-2 py-4 text-base disabled:opacity-40"
          >
            <Wand2 className="w-5 h-5" />
            Generar itinerario
            <ArrowRight className="w-4 h-4" />
          </button>

          {!canGenerate && (
            <p className="text-xs text-center text-slate-400 -mt-3">Necesitas al menos un destino y las fechas para continuar.</p>
          )}
        </div>
      )}

      {/* ── GENERATING STEP ──────────────────────────────────────────────────── */}
      {step === "generating" && <GeneratingSkeleton />}

      {/* ── PREVIEW STEP ─────────────────────────────────────────────────────── */}
      {step === "preview" && draft && (
        <div className="space-y-5">

          {/* Summary bar */}
          <div className="card-soft px-6 py-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Destino</p>
                <p className="text-sm font-extrabold text-slate-900">{destinationLabel}</p>
              </div>
              <div className="h-8 w-px bg-slate-200" />
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Duración</p>
                <p className="text-sm font-extrabold text-slate-900">{draft.totalDays} días</p>
              </div>
              <div className="h-8 w-px bg-slate-200" />
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Actividades</p>
                <p className="text-sm font-extrabold text-slate-900">{draft.days.reduce((a, d) => a + d.items.length, 0)} planes</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setStep("form"); }}
                className="btn-secondary flex items-center gap-1.5 text-sm py-2.5 px-4"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Empezar de nuevo
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={createTripFromDraft}
                className="btn-primary flex items-center gap-2 text-sm py-2.5 px-5 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Crear viaje
              </button>
            </div>
          </div>

          {/* Trip name (optional) */}
          <div className="card-soft px-6 py-4">
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">Nombre del viaje (opcional)</label>
            <input
              value={tripName}
              onChange={(e) => setTripName(e.target.value)}
              placeholder={`${destinationLabel} (${startDate} → ${endDate})`}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500 bg-white"
            />
          </div>

          {/* Two-column layout: itinerary + chat */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 items-start">

            {/* ── Itinerary ────────────────────────────────────────────── */}
            <div className="space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400 px-1">Itinerario día a día</h2>

              {draft.days.map((d) => {
                const expanded = expandedDays.has(d.day);
                const intro = dayIntroPhrase(d);

                return (
                  <div key={d.day} className="card-soft overflow-hidden">
                    {/* Day header */}
                    <button
                      type="button"
                      onClick={() => toggleDay(d.day)}
                      className="w-full flex items-start justify-between gap-3 px-5 py-4 text-left hover:bg-slate-50/60 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-bold uppercase tracking-widest text-violet-500">
                            Día {d.day}
                          </span>
                          <span className="text-xs font-semibold text-slate-400">·</span>
                          <span className="text-xs font-semibold text-slate-500">{d.date}</span>
                          <span className="text-xs font-semibold text-slate-400">·</span>
                          <span className="text-xs font-bold text-slate-600">{d.base}</span>
                        </div>
                        <p className="text-sm font-semibold text-slate-700 leading-snug">{intro}</p>
                        {!expanded && (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {d.items.slice(0, 3).map((it, i) => (
                              <span key={i} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                                {CATEGORY_KINDS.find((c) => c.key === it.activity_kind)?.emoji ?? "📍"}
                                {it.title.length > 28 ? it.title.slice(0, 28) + "…" : it.title}
                              </span>
                            ))}
                            {d.items.length > 3 && (
                              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-400">
                                +{d.items.length - 3} más
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 mt-0.5 text-slate-400">
                        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </button>

                    {/* Day items */}
                    {expanded && (
                      <div className="border-t border-slate-100 px-4 py-4 space-y-3">
                        {d.items.map((it, idx) => (
                          <PlanActivityCard
                            key={stableId(d.day, idx)}
                            activity={{
                              id: stableId(d.day, idx),
                              title: it.title,
                              description: it.description,
                              activity_date: it.activity_date,
                              activity_time: it.activity_time,
                              place_name: it.place_name,
                              address: it.address,
                              latitude: it.latitude,
                              longitude: it.longitude,
                              activity_kind: it.activity_kind,
                              activity_type: it.activity_type,
                              source: it.source,
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── Chat panel ───────────────────────────────────────────── */}
            <div className="card-soft flex flex-col sticky top-4 max-h-[calc(100vh-6rem)] overflow-hidden">
              {/* Chat header */}
              <div className="px-5 py-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-violet-500" />
                  <span className="text-sm font-extrabold text-slate-900">Refinar con IA</span>
                </div>
                <p className="mt-0.5 text-xs font-medium text-slate-400">
                  Pide cualquier cambio — lo aplico al instante.
                </p>
              </div>

              {/* Active rules chips */}
              {activeRules.length > 0 && (
                <div className="px-4 pt-3 flex flex-wrap gap-1.5">
                  {activeRules.map((r, i) => (
                    <button
                      key={`${r}-${i}`}
                      type="button"
                      onClick={() => setActiveRules((prev) => prev.filter((_, idx) => idx !== i))}
                      className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-700 hover:bg-violet-100 transition-colors"
                      title="Clic para desactivar esta preferencia"
                    >
                      {r.length > 30 ? r.slice(0, 30) + "…" : r} ×
                    </button>
                  ))}
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
                {chatMessages.map((m, idx) => (
                  <div key={idx} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    {m.role === "assistant" && (
                      <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center shrink-0 mt-0.5 mr-2">
                        <Sparkles className="w-3 h-3 text-violet-500" />
                      </div>
                    )}
                    <div
                      className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                        m.role === "user"
                          ? "bg-slate-900 text-white"
                          : "bg-slate-50 border border-slate-100 text-slate-800"
                      }`}
                    >
                      {m.text}
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center shrink-0 mt-0.5 mr-2">
                      <Sparkles className="w-3 h-3 text-violet-500" />
                    </div>
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl px-3.5 py-2.5">
                      <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                        <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                        <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Suggestions */}
              <div className="px-4 pb-2 flex flex-wrap gap-1.5">
                {CHAT_SUGGESTIONS.slice(0, 4).map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={chatLoading}
                    onClick={() => sendChat(s)}
                    className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors disabled:opacity-40"
                  >
                    {s}
                  </button>
                ))}
              </div>

              {/* Input */}
              <div className="px-4 pb-4 pt-2 border-t border-slate-100">
                <div className="flex gap-2">
                  <input
                    ref={chatInputRef}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void sendChat();
                      }
                    }}
                    disabled={chatLoading}
                    placeholder="Ej. Menos museos, más vida local…"
                    className="flex-1 min-w-0 rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-slate-500 bg-white disabled:opacity-50"
                  />
                  <button
                    type="button"
                    disabled={chatLoading || !chatInput.trim()}
                    onClick={() => sendChat()}
                    className="btn-primary shrink-0 px-3.5 py-2.5 disabled:opacity-40"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom CTA */}
          <div className="card-soft p-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-extrabold text-slate-900">¿Te gusta el itinerario?</p>
              <p className="text-xs font-medium text-slate-500">Crea el viaje y podrás seguir editando actividades desde el panel de plan.</p>
            </div>
            <button
              type="button"
              disabled={saving}
              onClick={createTripFromDraft}
              className="btn-primary flex items-center gap-2 py-3 px-6 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Crear viaje
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
