"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import TripPlacesFields from "@/components/dashboard/TripPlacesFields";
import { joinTripPlaces } from "@/lib/trip-places";
import { useToast } from "@/components/ui/toast";
import PlanActivityCard from "@/components/trip/plan/PlanActivityCard";
import {
  ArrowRight, Sparkles, Calendar, MapPin, MessageCircle,
  RotateCcw, ChevronDown, ChevronUp, Send, CheckCircle2,
  Loader2, Wand2, Plus, X, Globe, AlertTriangle, GripVertical, Info,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type Category =
  | "culture" | "nature" | "viewpoint" | "neighborhood"
  | "market" | "excursion" | "gastro_experience" | "shopping" | "night" | "transport";
type Poi = { name: string; lat: number; lng: number };
type DraftDayItem = { title: string; description: string | null; activity_date: string; activity_time: string | null; place_name: string | null; address: string | null; latitude: number | null; longitude: number | null; activity_kind: Category; activity_type: string | null; source: string | null };
type DraftDay = { day: number; date: string; base: string; items: DraftDayItem[] };
type StayRow = { stop: string; nights: number; reason?: string };
type ApiDraft = { totalDays: number; startDate: string; endDate: string; destinations: string[]; stays: StayRow[]; baseCityByDay: string[]; suggestions: Record<string, Array<{ category: Exclude<Category, "transport">; pois: Poi[] }>>; days: DraftDay[]; viability?: ViabilityResult | null; _debug?: { mergedNotes: string; blocks: Array<{ city: string; nights: number; prompt: string | null; rawOutput: string | null; itemsGenerated: number; itemsFiltered: number; emptyDays: number }> } };
type ViabilityResult = { viable: boolean; warning: string; suggestions: Array<{ stops: string[]; reason: string }> };
type ChatMessage = { role: "user" | "assistant"; text: string };
type CurrencyCode = "EUR" | "USD" | "GBP" | "ARS" | "MXN" | "CLP" | "BRL" | "JPY" | "CAD" | "AUD" | "CHF";
type SuggestedPlace = { name: string; lat: number; lng: number };
type PlanProposal = { totalDays: number; startDate: string; endDate: string; destinations: string[]; stops: Array<{ key: string; label: string }>; stays: StayRow[]; viability?: ViabilityResult | null };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isoOk(s: string) { return /^\d{4}-\d{2}-\d{2}$/.test(s); }
function totalDaysBetween(start: string, end: string) { if (!isoOk(start) || !isoOk(end)) return 1; const a = new Date(`${start}T12:00:00Z`).getTime(), b = new Date(`${end}T12:00:00Z`).getTime(); return Math.max(1, Math.round((b - a) / (86400 * 1000)) + 1); }
function stableId(day: number, idx: number) { return `draft-${day}-${idx}`; }

function inferCurrencyFromDestinations(destinations: string[]): CurrencyCode {
  const blob = destinations.join(" · ").toLowerCase();
  if (/\b(argentina|buenos aires|mendoza|bariloche)\b/i.test(blob)) return "ARS";
  if (/\b(chile|santiago)\b/i.test(blob)) return "CLP";
  if (/\b(m[eé]xico|mexico|cdmx)\b/i.test(blob)) return "MXN";
  if (/\b(brasil|brazil)\b/i.test(blob)) return "BRL";
  if (/\b(eeuu|usa|united states|new york)\b/i.test(blob)) return "USD";
  if (/\b(reino unido|uk|london)\b/i.test(blob)) return "GBP";
  if (/\b(jap[oó]n|japan|tokyo)\b/i.test(blob)) return "JPY";
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

function looksLikeCountryOrRegion(place: string) { const q = place.trim().toLowerCase(); if (q.length < 3 || /[0-9]/.test(q) || /[,\-–—/·]/.test(q)) return false; return q.split(/\s+/).length <= 3; }

function dayIntroPhrase(day: DraftDay): string {
  const kc: Record<string, number> = {}; for (const it of day.items) { const k = it.activity_kind || "visit"; kc[k] = (kc[k] || 0) + 1; }
  const dominant = Object.entries(kc).sort((a, b) => b[1] - a[1])[0]?.[0], city = day.base, n = day.items.length;
  const phrases: Record<string, string> = { culture: `Un día cargado de historia y arte en ${city}. ${n} parada${n !== 1 ? "s" : ""}.`, nature: `Jornada al aire libre cerca de ${city}. Espacios naturales que valen el madrugón.`, viewpoint: `Los mejores miradores de ${city} en un solo día.`, gastro_experience: `${city} tiene una escena gastronómica increíble — este día está pensado para saborearla.`, market: `Mercados, sabores locales y el pulso del día a día de ${city}.`, excursion: `Excursión desde ${city}. Un día fuera de la ciudad.`, neighborhood: `Explora los barrios con más carácter de ${city}.`, night: `La tarde-noche en ${city} tiene su propio ritmo. ${n} plan${n !== 1 ? "es" : ""}.`, transport: `Día de traslado.` };
  return phrases[dominant ?? "culture"] ?? `${n} plan${n !== 1 ? "es" : ""} en ${city}.`;
}

const CHAT_SUGGESTIONS = ["Menos museos, más vida local", "Añade más gastronomía", "Ritmo más tranquilo", "Más actividades al aire libre", "Incluye tarde-noche", "Quita las compras"];

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function GeneratingSkeleton({ label }: { label: string }) {
  const steps = [{ icon: "🗺️", label: "Localizando puntos de interés reales…" }, { icon: "📅", label: "Distribuyendo actividades por días…" }, { icon: "⏱️", label: "Ajustando horarios y ritmo…" }, { icon: "✅", label: "Revisando coherencia geográfica…" }];
  const [active, setActive] = useState(0);
  useEffect(() => { const id = setInterval(() => setActive((p) => (p + 1) % steps.length), 1800); return () => clearInterval(id); }, []);
  return (
    <div className="card-soft p-10 flex flex-col items-center justify-center gap-6 min-h-[280px]">
      <div className="relative">
        <div className="w-14 h-14 rounded-full border-4 border-violet-100 border-t-violet-500 animate-spin" />
        <Wand2 className="absolute inset-0 m-auto w-5 h-5 text-violet-500" />
      </div>
      <div className="text-center space-y-1">
        <p className="text-sm font-bold text-slate-900">{label}</p>
        <p className="text-xs font-medium text-slate-400">{steps[active]?.icon} {steps[active]?.label}</p>
      </div>
    </div>
  );
}

// ─── Destination Suggester ────────────────────────────────────────────────────

function DestinationSuggester({ query, selectedPlaces, onAdd, onRemove, totalDays }: { query: string; selectedPlaces: string[]; onAdd: (p: string) => void; onRemove: (p: string) => void; totalDays: number }) {
  const [suggestions, setSuggestions] = useState<SuggestedPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => { setSuggestions([]); setOffset(0); setHasMore(true); void load(0); }, [query]); // eslint-disable-line

  async function load(currentOffset: number) {
    setLoading(true);
    try {
      const res = await fetch("/api/geocode/suggest-places", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, limit: 24, offset: currentOffset }) });
      const data = await res.json().catch(() => null);
      const places: SuggestedPlace[] = Array.isArray(data?.places) ? data.places : [];
      setSuggestions((prev) => currentOffset === 0 ? places : [...prev, ...places]);
      setOffset(currentOffset + places.length); setHasMore(places.length >= 12);
    } finally { setLoading(false); }
  }

  const splitHint = useMemo(() => { if (!selectedPlaces.length) return null; const dpp = Math.max(1, Math.round(totalDays / selectedPlaces.length)); return `Con ${totalDays} días y ${selectedPlaces.length} destino${selectedPlaces.length !== 1 ? "s" : ""}, ~${dpp} día${dpp !== 1 ? "s" : ""} por lugar (la IA ajustará según importancia turística).`; }, [selectedPlaces.length, totalDays]);

  if (suggestions.length === 0 && !loading) return null;

  return (
    <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50/50 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <Globe className="w-4 h-4 text-violet-500 mt-0.5 shrink-0" />
        <div><p className="text-sm font-bold text-violet-900">¿Qué lugares quieres visitar en <span className="font-extrabold">{query}</span>?</p><p className="text-xs font-medium text-violet-600 mt-0.5">Elige varios — la IA repartirá los días según la riqueza de cada lugar.</p></div>
      </div>
      {selectedPlaces.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedPlaces.map((p) => (
            <div key={p} className="flex items-center gap-1.5 rounded-full bg-violet-600 text-white px-3 py-1 text-xs font-bold">
              <MapPin className="w-3 h-3" />{p}<button type="button" onClick={() => onRemove(p)} className="ml-0.5 hover:opacity-75"><X className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
      )}
      {loading && suggestions.length === 0 ? (
        <div className="flex items-center gap-2 text-xs font-semibold text-violet-500"><Loader2 className="w-3.5 h-3.5 animate-spin" />Buscando lugares…</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {suggestions.filter((s) => !selectedPlaces.includes(s.name)).map((s) => (
            <button key={s.name} type="button" onClick={() => onAdd(s.name)} className="flex items-center gap-1 rounded-full border border-violet-200 bg-white px-3 py-1 text-xs font-semibold text-violet-800 hover:bg-violet-100 transition-colors"><Plus className="w-3 h-3" />{s.name}</button>
          ))}
          {hasMore && <button type="button" disabled={loading} onClick={() => void load(offset)} className="rounded-full border border-violet-200 bg-white px-3 py-1 text-xs font-semibold text-violet-600 hover:bg-violet-50 disabled:opacity-50">{loading ? <Loader2 className="w-3 h-3 animate-spin inline" /> : "+ Ver más"}</button>}
        </div>
      )}
      {splitHint && <p className="text-xs font-semibold text-violet-600 bg-violet-100 rounded-xl px-3 py-2">💡 {splitHint}</p>}
    </div>
  );
}

// ─── Plan Review Step ─────────────────────────────────────────────────────────
// Drag & drop uses pointer events (works on both desktop and mobile).

function PlanReviewStep({ proposal, onConfirm, onBack, loading }: { proposal: PlanProposal; onConfirm: (stays: StayRow[]) => void; onBack: () => void; loading: boolean }) {
  const [stays, setStays] = useState<StayRow[]>(() => proposal.stays.map((s) => ({ ...s })));
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [dismissedViability, setDismissedViability] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const totalNights = stays.reduce((a, b) => a + b.nights, 0);
  const nightsOk = totalNights === proposal.totalDays;

  function setNights(i: number, n: number) { setStays((prev) => prev.map((s, idx) => idx === i ? { ...s, nights: Math.max(1, Math.min(60, n)) } : s)); }

  // Pointer-based drag (works on touch too)
  function handlePointerDown(e: React.PointerEvent, idx: number) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragIdx(idx);
    setHoverIdx(idx);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (dragIdx === null || !listRef.current) return;
    const items = listRef.current.querySelectorAll("[data-drag-item]");
    let newHover: number | null = null;
    items.forEach((el, i) => {
      const rect = el.getBoundingClientRect();
      if (e.clientY >= rect.top && e.clientY <= rect.bottom) newHover = i;
    });
    if (newHover !== null && newHover !== hoverIdx) setHoverIdx(newHover);
  }

  function handlePointerUp() {
    if (dragIdx !== null && hoverIdx !== null && dragIdx !== hoverIdx) {
      setStays((prev) => { const next = [...prev]; const [moved] = next.splice(dragIdx, 1); next.splice(hoverIdx, 0, moved!); return next; });
    }
    setDragIdx(null); setHoverIdx(null);
  }

  const viability = proposal.viability;

  return (
    <div className="space-y-5">
      <div className="card-soft px-6 py-5">
        <div className="flex items-center gap-2 mb-1"><Sparkles className="w-4 h-4 text-violet-500" /><span className="text-sm font-extrabold text-slate-900">Plan de ruta propuesto por la IA</span></div>
        <p className="text-xs font-medium text-slate-500">La IA ha calculado el reparto según la riqueza turística, las distancias y tus preferencias. Arrastra para reordenar · Ajusta los días · Confirma para generar el itinerario.</p>
      </div>

      {viability && !viability.viable && !dismissedViability && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0"><p className="text-sm font-bold text-amber-900">{viability.warning}</p><p className="text-xs font-medium text-amber-700 mt-1">Alternativas viables para el tiempo disponible:</p></div>
            <button type="button" onClick={() => setDismissedViability(true)} className="text-amber-400 hover:text-amber-600 shrink-0"><X className="w-4 h-4" /></button>
          </div>
          <div className="space-y-2">
            {viability.suggestions.map((sug, i) => (
              <button key={i} type="button"
                onClick={() => { setStays(sug.stops.map((stop) => { const ex = proposal.stays.find((s) => s.stop === stop); return { stop, nights: ex?.nights || Math.max(1, Math.round(proposal.totalDays / sug.stops.length)), reason: ex?.reason }; })); setDismissedViability(true); }}
                className="w-full text-left rounded-xl border border-amber-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-amber-50 transition-colors flex items-center justify-between gap-2">
                <span><span className="text-amber-700 font-bold">Opción {i + 1}:</span> {sug.reason}</span>
                <ArrowRight className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="card-soft p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div><p className="text-sm font-bold text-slate-900">Reparto de días</p><p className="text-xs font-medium text-slate-500 mt-0.5">Arrastra 〓 para reordenar · +/− para cambiar días</p></div>
          <div className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold border ${nightsOk ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-amber-50 border-amber-200 text-amber-700"}`}>
            {nightsOk ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
            {totalNights}/{proposal.totalDays} días{nightsOk ? " ✓" : ""}
          </div>
        </div>

        <div
          ref={listRef}
          className="space-y-2 touch-none select-none"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {stays.map((s, i) => {
            const isDragging = dragIdx === i;
            const isHoverTarget = hoverIdx === i && dragIdx !== null && dragIdx !== i;
            return (
              <div
                key={`${s.stop}-${i}`}
                data-drag-item
                className={`flex items-center gap-3 rounded-2xl border px-4 py-3 bg-white transition-all ${isDragging ? "opacity-40 scale-95 border-violet-300" : isHoverTarget ? "border-violet-400 bg-violet-50 ring-2 ring-violet-200" : "border-slate-200 hover:border-slate-300"}`}
              >
                {/* Drag handle */}
                <div
                  className="cursor-grab active:cursor-grabbing p-1 -ml-1 text-slate-300 hover:text-slate-500 touch-none shrink-0"
                  onPointerDown={(e) => handlePointerDown(e, i)}
                >
                  <GripVertical className="w-4 h-4" />
                </div>

                {/* Stop number badge */}
                <div className="w-6 h-6 rounded-full bg-violet-100 text-violet-700 text-xs font-extrabold flex items-center justify-center shrink-0">{i + 1}</div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-extrabold text-slate-900 truncate">{s.stop}</p>
                  {s.reason && (
                    <p className="text-xs font-medium text-slate-400 mt-0.5 truncate flex items-center gap-1">
                      <Info className="w-3 h-3 shrink-0" />
                      {s.reason.replace(/^\d+ días? — /, "")}
                    </p>
                  )}
                </div>

                {/* Night controls */}
                <div className="flex items-center gap-2 shrink-0">
                  <button type="button" onClick={() => setNights(i, s.nights - 1)} disabled={s.nights <= 1} className="w-7 h-7 rounded-full border border-slate-200 bg-slate-50 text-slate-600 text-sm font-bold hover:bg-slate-100 disabled:opacity-30 flex items-center justify-center">−</button>
                  <span className="w-8 text-center text-sm font-extrabold text-slate-900">{s.nights}</span>
                  <button type="button" onClick={() => setNights(i, s.nights + 1)} className="w-7 h-7 rounded-full border border-slate-200 bg-slate-50 text-slate-600 text-sm font-bold hover:bg-slate-100 flex items-center justify-center">+</button>
                  <span className="text-xs font-semibold text-slate-400 w-10">día{s.nights !== 1 ? "s" : ""}</span>
                </div>
              </div>
            );
          })}
        </div>

        {!nightsOk && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 text-xs font-semibold text-amber-800 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            Los días no suman {proposal.totalDays}. Ajusta los valores para poder continuar.
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button type="button" onClick={onBack} className="btn-secondary flex items-center gap-1.5 text-sm py-3 px-5"><RotateCcw className="w-3.5 h-3.5" />Cambiar destinos</button>
        <button type="button" disabled={!nightsOk || loading} onClick={() => onConfirm(stays)} className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm py-3 disabled:opacity-40">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
          Generar itinerario con este plan
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Debug Panel ──────────────────────────────────────────────────────────────
// Shows prompts sent to Gemini, raw outputs, and filter stats.
// Lets you download everything as text files for analysis.

function DebugPanel({ draft }: { draft: ApiDraft }) {
  const [open, setOpen] = useState(false);
  const [activeBlock, setActiveBlock] = useState(0);
  const debug = draft._debug;

  function download(filename: string, content: string) {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  function downloadAllPrompts() {
    if (!debug) return;
    const content = debug.blocks.map((b, i) =>
      `${"=".repeat(60)}\nBLOQUE ${i + 1}: ${b.city} (${b.nights} noches)\n${"=".repeat(60)}\n\n${b.prompt ?? "(sin prompt)"}\n`
    ).join("\n\n");
    download("prompts.txt", `PREFERENCIAS MERGED:\n${debug.mergedNotes}\n\n${content}`);
  }

  function downloadAllOutputs() {
    if (!debug) return;
    const content = debug.blocks.map((b, i) =>
      `${"=".repeat(60)}\nBLOQUE ${i + 1}: ${b.city} — generados: ${b.itemsGenerated}, filtrados: ${b.itemsFiltered}, días vacíos: ${b.emptyDays}\n${"=".repeat(60)}\n\n${b.rawOutput ?? "(sin output)"}\n`
    ).join("\n\n");
    download("gemini_outputs.txt", content);
  }

  function downloadAllPlans() {
    const content = draft.days.map((d) =>
      `DÍA ${d.day} — ${d.date} — ${d.base}\n` +
      (d.items.length === 0
        ? "  (sin actividades)\n"
        : d.items.map((it) => `  [${it.activity_time ?? "--:--"}] [${it.activity_kind}] ${it.title}${it.description ? `\n    → ${it.description}` : ""}`).join("\n") + "\n")
    ).join("\n");
    download("planes.txt", `DESTINOS: ${draft.destinations.join(", ")}\nFECHAS: ${draft.startDate} → ${draft.endDate}\nNOTAS: ${debug?.mergedNotes ?? ""}\n\n${content}`);
  }

  if (!debug) return null;

  const emptyDaysTotal = draft.days.filter((d) => d.items.length === 0).length;
  const sparseTotal = draft.days.filter((d) => d.items.length > 0 && d.items.length < 3).length;

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-slate-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-widest text-slate-400">🔧 Debug Gemini</span>
          {(emptyDaysTotal > 0 || sparseTotal > 0) && (
            <span className="rounded-full bg-amber-100 border border-amber-200 px-2 py-0.5 text-xs font-bold text-amber-700">
              {emptyDaysTotal > 0 ? `${emptyDaysTotal} días vacíos` : ""}{emptyDaysTotal > 0 && sparseTotal > 0 ? " · " : ""}{sparseTotal > 0 ? `${sparseTotal} días escasos` : ""}
            </span>
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
      </button>

      {open && (
        <div className="border-t border-slate-200 p-5 space-y-4">
          {/* Download buttons */}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={downloadAllPrompts} className="btn-secondary text-xs py-2 px-3 flex items-center gap-1.5">
              ⬇ Descargar prompts (.txt)
            </button>
            <button type="button" onClick={downloadAllOutputs} className="btn-secondary text-xs py-2 px-3 flex items-center gap-1.5">
              ⬇ Descargar outputs Gemini (.txt)
            </button>
            <button type="button" onClick={downloadAllPlans} className="btn-secondary text-xs py-2 px-3 flex items-center gap-1.5">
              ⬇ Descargar planes finales (.txt)
            </button>
          </div>

          {/* Merged notes */}
          <div>
            <p className="text-xs font-bold text-slate-500 mb-1">Preferencias enviadas a Gemini:</p>
            <pre className="rounded-xl bg-white border border-slate-200 px-3 py-2 text-xs text-slate-700 whitespace-pre-wrap break-words max-h-24 overflow-y-auto">
              {debug.mergedNotes || "(ninguna)"}
            </pre>
          </div>

          {/* Stats per block */}
          <div>
            <p className="text-xs font-bold text-slate-500 mb-2">Bloques generados:</p>
            <div className="flex gap-2 flex-wrap mb-3">
              {debug.blocks.map((b, i) => (
                <button
                  key={i} type="button"
                  onClick={() => setActiveBlock(i)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold border transition-colors ${activeBlock === i ? "bg-slate-900 text-white border-slate-900" : "bg-white border-slate-200 text-slate-600 hover:border-slate-400"}`}
                >
                  {b.city} ({b.nights}d)
                  {b.emptyDays > 0 && <span className="ml-1 text-amber-400">⚠️{b.emptyDays}</span>}
                </button>
              ))}
            </div>

            {debug.blocks[activeBlock] && (() => {
              const b = debug.blocks[activeBlock]!;
              return (
                <div className="space-y-3">
                  <div className="flex gap-3 flex-wrap text-xs">
                    <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 font-semibold text-emerald-700">✓ {b.itemsGenerated} generados</span>
                    <span className="rounded-full bg-red-50 border border-red-200 px-2.5 py-1 font-semibold text-red-700">✗ {b.itemsFiltered} filtrados</span>
                    <span className={`rounded-full px-2.5 py-1 font-semibold border ${b.emptyDays > 0 ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-slate-50 border-slate-200 text-slate-500"}`}>
                      📅 {b.emptyDays} días vacíos
                    </span>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-500 mb-1">Prompt enviado:</p>
                    <pre className="rounded-xl bg-white border border-slate-200 px-3 py-2 text-xs text-slate-700 whitespace-pre-wrap break-words max-h-48 overflow-y-auto font-mono leading-relaxed">
                      {b.prompt || "(desde caché)"}
                    </pre>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-500 mb-1">Raw output de Gemini:</p>
                    <pre className="rounded-xl bg-white border border-slate-200 px-3 py-2 text-xs text-slate-600 whitespace-pre-wrap break-words max-h-64 overflow-y-auto font-mono leading-relaxed">
                      {b.rawOutput || "(desde caché)"}
                    </pre>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* Days summary */}
          <div>
            <p className="text-xs font-bold text-slate-500 mb-2">Resumen de días:</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {draft.days.map((d) => (
                <div key={d.day} className={`rounded-xl px-3 py-2 border text-xs ${d.items.length === 0 ? "bg-red-50 border-red-200 text-red-700" : d.items.length < 3 ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-emerald-50 border-emerald-200 text-emerald-700"}`}>
                  <span className="font-bold">Día {d.day}</span> · {d.base}<br />
                  <span className="font-semibold">{d.items.length} actividades</span>
                  {d.items.length === 0 && <span className="ml-1">⚠️ VACÍO</span>}
                  {d.items.length > 0 && d.items.length < 3 && <span className="ml-1">⚠️ escaso</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TripAiPlannerWizard() {
  const router = useRouter();
  const toast = useToast();
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [step, setStep] = useState<"form" | "planning" | "review" | "generating" | "preview">("form");
  const [places, setPlaces] = useState<string[]>([""]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [freeText, setFreeText] = useState("");
  const [tripName, setTripName] = useState("");
  const [subDestinations, setSubDestinations] = useState<Record<string, string[]>>({});
  const [planProposal, setPlanProposal] = useState<PlanProposal | null>(null);
  const [draft, setDraft] = useState<ApiDraft | null>(null);
  const [confirmedStays, setConfirmedStays] = useState<StayRow[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [activeRules, setActiveRules] = useState<string[]>([]);
  const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set([1]));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const totalDays = useMemo(() => totalDaysBetween(startDate, endDate), [startDate, endDate]);
  const inferredCurrency = useMemo(() => inferCurrencyFromDestinations(places.map((x) => x.trim()).filter(Boolean)), [places]);
  const countryLikePlaces = useMemo(() => places.map((p) => p.trim()).filter((p) => p.length > 0 && looksLikeCountryOrRegion(p)), [places]);
  const effectiveDestinations = useMemo(() => { const result: string[] = []; for (const p of places) { const t = p.trim(); if (!t) continue; if (looksLikeCountryOrRegion(t) && subDestinations[t]?.length) result.push(...subDestinations[t]); else result.push(t); } return result.filter(Boolean); }, [places, subDestinations]);
  const destinationLabel = useMemo(() => joinTripPlaces(effectiveDestinations), [effectiveDestinations]);
  const canGenerate = useMemo(() => effectiveDestinations.length > 0 && isoOk(startDate) && isoOk(endDate) && endDate >= startDate, [effectiveDestinations, startDate, endDate]);

  useEffect(() => { if (!isoOk(startDate)) return; if (!endDate || endDate < startDate) setEndDate(startDate); }, [startDate]); // eslint-disable-line
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

  function addSubDestination(base: string, city: string) { setSubDestinations((prev) => { const cur = prev[base] || []; if (cur.includes(city)) return prev; return { ...prev, [base]: [...cur, city] }; }); }
  function removeSubDestination(base: string, city: string) { setSubDestinations((prev) => ({ ...prev, [base]: (prev[base] || []).filter((c) => c !== city) })); }

  async function fetchPlan() {
    setError(null); setStep("planning");
    try {
      const res = await fetch("/api/trips/ai-planner/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ destinations: effectiveDestinations, start_date: startDate, end_date: endDate, freeText: freeText.trim() || undefined, planOnly: true }) });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "No se pudo calcular el plan.");
      setPlanProposal(data as PlanProposal); setStep("review");
    } catch (e) { const msg = e instanceof Error ? e.message : "No se pudo calcular el plan."; setError(msg); setStep("form"); toast.error("Error", msg); }
  }

  async function generateDraft(stays: StayRow[], opts?: { regenerateBadOnly?: boolean }) {
    setError(null); setStep("generating");
    try {
      const res = await fetch("/api/trips/ai-planner/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destinations: effectiveDestinations, start_date: startDate, end_date: endDate, stays, freeText: freeText.trim() || undefined, days: draft?.days || undefined, regenerateBadOnly: Boolean(opts?.regenerateBadOnly), rules: activeRules }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "No se pudo generar el itinerario.");
      setDraft(data as ApiDraft); setConfirmedStays(stays); setExpandedDays(new Set([1])); setStep("preview");
      if (!chatMessages.length) setChatMessages([{ role: "assistant", text: `He generado un itinerario de ${(data as ApiDraft).totalDays} días con lugares reales. ¿Quieres ajustar algo?` }]);
    } catch (e) { const msg = e instanceof Error ? e.message : "No se pudo generar el itinerario."; setError(msg); setStep(draft ? "preview" : "review"); toast.error("Error al generar", msg); }
  }

  async function sendChat(text?: string) {
    const msg = (text ?? chatInput).trim(); if (!msg || !draft) return;
    setChatInput(""); setChatMessages((prev) => [...prev, { role: "user", text: msg }]);
    setActiveRules((prev) => [...prev, msg].slice(-12)); setChatLoading(true);
    setChatMessages((prev) => [...prev, { role: "assistant", text: "Entendido, actualizo el itinerario con eso en mente…" }]);
    try { await generateDraft(confirmedStays, { regenerateBadOnly: false }); } finally { setChatLoading(false); }
  }

  async function createTripFromDraft() {
    if (!draft) return;
    const name = (tripName.trim() || `${destinationLabel} (${startDate} → ${endDate})`).trim();
    setSaving(true); setError(null);
    try {
      const createRes = await fetch("/api/trips", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, destination: destinationLabel, start_date: startDate, end_date: endDate, base_currency: inferredCurrency }) });
      const createPayload = await createRes.json().catch(() => null);
      if (!createRes.ok) throw new Error(createPayload?.error || "No se pudo crear el viaje.");
      const tripId = String(createPayload?.tripId || ""); if (!tripId) throw new Error("No se pudo crear el viaje.");
      for (const k of CATEGORY_KINDS) await fetch("/api/trip-activity-kinds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tripId, kind_key: k.key, label: k.label, emoji: k.emoji, color: k.color }) }).catch(() => null);
      const bulk = draft.days.flatMap((d) => (d.items || []).map((it) => ({ title: it.title, description: it.description, activity_date: it.activity_date, activity_time: it.activity_time, place_name: it.place_name, address: it.address, latitude: it.latitude, longitude: it.longitude, activity_type: it.activity_type, activity_kind: it.activity_kind, source: "ai_planner" })));
      const bulkRes = await fetch("/api/trip-activities/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tripId, activities: bulk }) });
      if (!bulkRes.ok) { const p = await bulkRes.json().catch(() => null); throw new Error(p?.error || "No se pudieron crear los planes."); }
      toast.success("¡Viaje creado!", "Tu itinerario está listo en el panel de plan.");
      router.push(`/trip/${encodeURIComponent(tripId)}/plan`); router.refresh();
    } catch (e) { const msg = e instanceof Error ? e.message : "No se pudo crear el viaje."; setError(msg); toast.error("Error", msg); } finally { setSaving(false); }
  }

  function toggleDay(day: number) { setExpandedDays((prev) => { const next = new Set(prev); if (next.has(day)) next.delete(day); else next.add(day); return next; }); }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-1">

      <div>
        <div className="flex items-center gap-2 mb-1"><Sparkles className="w-5 h-5 text-violet-500" /><span className="text-xs font-bold uppercase tracking-widest text-violet-600">Premium · IA</span></div>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Planificador inteligente</h1>
        <p className="mt-1.5 text-sm font-medium text-slate-500 max-w-md">La IA propone el reparto de días, tú lo ajustas, y luego genera un itinerario real con lugares concretos.</p>
      </div>

      {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 flex items-start gap-2"><span className="mt-0.5">⚠️</span><span>{error}</span></div>}

      {/* FORM */}
      {step === "form" && (
        <div className="card-soft p-7 space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-3"><MapPin className="w-4 h-4 text-slate-400" /><span className="text-sm font-bold text-slate-800">¿A dónde vas?</span></div>
            <TripPlacesFields places={places} onChange={setPlaces} />
            {countryLikePlaces.map((cp) => <DestinationSuggester key={cp} query={cp} selectedPlaces={subDestinations[cp] || []} onAdd={(city) => addSubDestination(cp, city)} onRemove={(city) => removeSubDestination(cp, city)} totalDays={totalDays} />)}
            {effectiveDestinations.length > 1 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="text-xs font-bold text-slate-400 self-center">Se generará con:</span>
                {effectiveDestinations.map((d) => <span key={d} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">📍 {d}</span>)}
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2 mb-3"><Calendar className="w-4 h-4 text-slate-400" /><span className="text-sm font-bold text-slate-800">¿Cuándo?</span></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="mb-1 block text-xs font-semibold text-slate-500">Fecha de inicio</label><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500 bg-white" /></div>
              <div><label className="mb-1 block text-xs font-semibold text-slate-500">Fecha de fin {isoOk(startDate) && isoOk(endDate) && <span className="ml-2 text-violet-600 font-bold">{totalDays} días</span>}</label><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} min={startDate || undefined} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500 bg-white" /></div>
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-3"><MessageCircle className="w-4 h-4 text-slate-400" /><span className="text-sm font-bold text-slate-800">¿Alguna preferencia? <span className="text-slate-400 font-normal">(opcional)</span></span></div>
            <textarea value={freeText} onChange={(e) => setFreeText(e.target.value)} rows={3} placeholder="Ej: viajamos en pareja, gastronomía local, sin museos, ritmo tranquilo…" className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500 bg-white resize-none" />
            <div className="mt-2 flex flex-wrap gap-2">
              {["Sin museos", "Gastronomía local", "Ritmo tranquilo", "Con niños", "Presupuesto ajustado", "Mucha naturaleza"].map((hint) => <button key={hint} type="button" onClick={() => setFreeText((prev) => prev ? `${prev}, ${hint.toLowerCase()}` : hint.toLowerCase())} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors">{hint}</button>)}
            </div>
          </div>
          <button type="button" disabled={!canGenerate} onClick={fetchPlan} className="btn-primary w-full flex items-center justify-center gap-2 py-4 text-base disabled:opacity-40">
            <Wand2 className="w-5 h-5" />Calcular reparto de días<ArrowRight className="w-4 h-4" />
          </button>
          {!canGenerate && <p className="text-xs text-center text-slate-400 -mt-3">Necesitas al menos un destino y las fechas para continuar.</p>}
        </div>
      )}

      {step === "planning" && <GeneratingSkeleton label="Calculando el reparto óptimo de días…" />}

      {step === "review" && planProposal && (
        <PlanReviewStep proposal={planProposal} onConfirm={(stays) => generateDraft(stays)} onBack={() => setStep("form")} loading={false} />
      )}

      {step === "generating" && <GeneratingSkeleton label="Generando el itinerario completo con Gemini…" />}

      {/* PREVIEW */}
      {step === "preview" && draft && (
        <div className="space-y-5">
          <div className="card-soft px-6 py-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <div><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Destino</p><p className="text-sm font-extrabold text-slate-900 max-w-xs truncate">{destinationLabel}</p></div>
              <div className="h-8 w-px bg-slate-200 hidden sm:block" />
              <div><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Duración</p><p className="text-sm font-extrabold text-slate-900">{draft.totalDays} días</p></div>
              <div className="h-8 w-px bg-slate-200 hidden sm:block" />
              <div><p className="text-xs font-bold uppercase tracking-widest text-slate-400">Actividades</p><p className="text-sm font-extrabold text-slate-900">{draft.days.reduce((a, d) => a + d.items.length, 0)} planes</p></div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setStep("review")} className="btn-secondary flex items-center gap-1.5 text-sm py-2.5 px-4"><RotateCcw className="w-3.5 h-3.5" />Cambiar reparto</button>
              <button type="button" disabled={saving} onClick={createTripFromDraft} className="btn-primary flex items-center gap-2 text-sm py-2.5 px-5 disabled:opacity-50">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}Crear viaje</button>
            </div>
          </div>

          <div className="card-soft px-6 py-4">
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-slate-400">Nombre del viaje (opcional)</label>
            <input value={tripName} onChange={(e) => setTripName(e.target.value)} placeholder={`${destinationLabel} (${startDate} → ${endDate})`} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500 bg-white" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 items-start">
            <div className="space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400 px-1">Itinerario día a día</h2>
              {draft.days.map((d) => {
                const expanded = expandedDays.has(d.day);
                return (
                  <div key={d.day} className="card-soft overflow-hidden">
                    <button type="button" onClick={() => toggleDay(d.day)} className="w-full flex items-start justify-between gap-3 px-5 py-4 text-left hover:bg-slate-50/60 transition-colors">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-bold uppercase tracking-widest text-violet-500">Día {d.day}</span>
                          <span className="text-xs text-slate-400">·</span><span className="text-xs text-slate-500">{d.date}</span>
                          <span className="text-xs text-slate-400">·</span><span className="text-xs font-bold text-slate-600">{d.base}</span>
                        </div>
                        <p className="text-sm font-semibold text-slate-700 leading-snug">{dayIntroPhrase(d)}</p>
                        {!expanded && (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {d.items.slice(0, 3).map((it, i) => <span key={i} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">{CATEGORY_KINDS.find((c) => c.key === it.activity_kind)?.emoji ?? "📍"}{it.title.length > 28 ? it.title.slice(0, 28) + "…" : it.title}</span>)}
                            {d.items.length > 3 && <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-400">+{d.items.length - 3} más</span>}
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 mt-0.5 text-slate-400">{expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</div>
                    </button>
                    {expanded && (
                      <div className="border-t border-slate-100 px-4 py-4 space-y-3">
                        {d.items.map((it, idx) => <PlanActivityCard key={stableId(d.day, idx)} activity={{ id: stableId(d.day, idx), title: it.title, description: it.description, activity_date: it.activity_date, activity_time: it.activity_time, place_name: it.place_name, address: it.address, latitude: it.latitude, longitude: it.longitude, activity_kind: it.activity_kind, activity_type: it.activity_type, source: it.source }} />)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="card-soft flex flex-col sticky top-4 max-h-[calc(100vh-6rem)] overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <div className="flex items-center gap-2"><MessageCircle className="w-4 h-4 text-violet-500" /><span className="text-sm font-extrabold text-slate-900">Refinar con IA</span></div>
                <p className="mt-0.5 text-xs font-medium text-slate-400">Pide cualquier cambio — regenera el itinerario al instante.</p>
              </div>
              {activeRules.length > 0 && (
                <div className="px-4 pt-3 flex flex-wrap gap-1.5">
                  {activeRules.map((r, i) => <button key={`${r}-${i}`} type="button" onClick={() => setActiveRules((prev) => prev.filter((_, idx) => idx !== i))} className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-700 hover:bg-violet-100">{r.length > 30 ? r.slice(0, 30) + "…" : r} ×</button>)}
                </div>
              )}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
                {chatMessages.map((m, idx) => (
                  <div key={idx} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    {m.role === "assistant" && <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center shrink-0 mt-0.5 mr-2"><Sparkles className="w-3 h-3 text-violet-500" /></div>}
                    <div className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${m.role === "user" ? "bg-slate-900 text-white" : "bg-slate-50 border border-slate-100 text-slate-800"}`}>{m.text}</div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center shrink-0 mt-0.5 mr-2"><Sparkles className="w-3 h-3 text-violet-500" /></div>
                    <div className="bg-slate-50 border border-slate-100 rounded-2xl px-3.5 py-2.5"><div className="flex gap-1">{[0, 150, 300].map((d) => <div key={d} className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />)}</div></div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
              <div className="px-4 pb-2 flex flex-wrap gap-1.5">
                {CHAT_SUGGESTIONS.slice(0, 4).map((s) => <button key={s} type="button" disabled={chatLoading} onClick={() => sendChat(s)} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40">{s}</button>)}
              </div>
              <div className="px-4 pb-4 pt-2 border-t border-slate-100">
                <div className="flex gap-2">
                  <input value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendChat(); } }} disabled={chatLoading} placeholder="Ej. Añade una visita a un mercado local…" className="flex-1 min-w-0 rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none focus:border-slate-500 bg-white disabled:opacity-50" />
                  <button type="button" disabled={chatLoading || !chatInput.trim()} onClick={() => sendChat()} className="btn-primary shrink-0 px-3.5 py-2.5 disabled:opacity-40"><Send className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          </div>

          <div className="card-soft p-5 flex flex-wrap items-center justify-between gap-4">
            <div><p className="text-sm font-extrabold text-slate-900">¿Te gusta el itinerario?</p><p className="text-xs font-medium text-slate-500">Crea el viaje y podrás seguir editando desde el panel de plan.</p></div>
            <button type="button" disabled={saving} onClick={createTripFromDraft} className="btn-primary flex items-center gap-2 py-3 px-6 disabled:opacity-50">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}Crear viaje</button>
          </div>

          {/* ── DEBUG PANEL ───────────────────────────────────────────────── */}
          <DebugPanel draft={draft} />
        </div>
      )}
    </div>
  );
}
