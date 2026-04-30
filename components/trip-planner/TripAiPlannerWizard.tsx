"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TripPlacesFields from "@/components/dashboard/TripPlacesFields";
import { joinTripPlaces } from "@/lib/trip-places";
import { useToast } from "@/components/ui/toast";
import PlanActivityCard from "@/components/trip/plan/PlanActivityCard";

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

type ChatScope = { kind: "all" } | { kind: "day"; day: number } | { kind: "range"; from: number; to: number };

type CurrencyCode = "EUR" | "USD" | "GBP" | "ARS" | "MXN" | "CLP" | "BRL" | "JPY" | "CAD" | "AUD" | "CHF";

function isoOk(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function totalDaysBetween(start: string, end: string) {
  if (!isoOk(start) || !isoOk(end)) return 1;
  const a = new Date(`${start}T12:00:00Z`).getTime();
  const b = new Date(`${end}T12:00:00Z`).getTime();
  const diff = Math.round((b - a) / (86400 * 1000)) + 1;
  return Math.max(1, diff);
}

function normalizeStop(s: string) {
  return String(s || "").trim();
}

function sumNights(stays: StayRow[]) {
  return stays.reduce((a, b) => a + (Number(b.nights) || 0), 0);
}

function stableId(day: number, idx: number) {
  return `draft-${day}-${idx}`;
}

const DRAFT_STORAGE_KEY = "kaviro.aiPlannerDraft.v1";

function inferScopeFromText(textRaw: string, maxDay: number): { scope: ChatScope | null } {
  const text = String(textRaw || "").toLowerCase();
  if (/\b(todo el viaje|todos los dias|todas las actividades|en todos los d[ií]as|en todo el viaje)\b/i.test(text)) {
    return { scope: { kind: "all" } };
  }
  const mDay = /\bd[ií]a\s+(\d{1,2})\b/i.exec(text);
  if (mDay) {
    const d = Math.max(1, Math.min(maxDay, Number(mDay[1]) || 1));
    return { scope: { kind: "day", day: d } };
  }
  const mRange = /\bd[ií]as?\s+(\d{1,2})\s*[-–—]\s*(\d{1,2})\b/i.exec(text);
  if (mRange) {
    let a = Number(mRange[1]) || 1;
    let b = Number(mRange[2]) || 1;
    if (a > b) [a, b] = [b, a];
    a = Math.max(1, Math.min(maxDay, a));
    b = Math.max(1, Math.min(maxDay, b));
    return { scope: { kind: "range", from: a, to: b } };
  }
  return { scope: null };
}

function scopeToTargetDays(scope: ChatScope, maxDay: number): number[] | null {
  if (scope.kind === "all") return null;
  if (scope.kind === "day") return [Math.max(1, Math.min(maxDay, scope.day))];
  const from = Math.max(1, Math.min(maxDay, scope.from));
  const to = Math.max(1, Math.min(maxDay, scope.to));
  const out: number[] = [];
  for (let i = Math.min(from, to); i <= Math.max(from, to); i++) out.push(i);
  return out;
}

const CURRENCY_OPTIONS: Array<{ code: CurrencyCode; label: string }> = [
  { code: "EUR", label: "EUR (€)" },
  { code: "USD", label: "USD ($)" },
  { code: "GBP", label: "GBP (£)" },
  { code: "ARS", label: "ARS ($AR)" },
  { code: "MXN", label: "MXN ($)" },
  { code: "CLP", label: "CLP ($)" },
  { code: "BRL", label: "BRL (R$)" },
  { code: "JPY", label: "JPY (¥)" },
  { code: "CAD", label: "CAD ($)" },
  { code: "AUD", label: "AUD ($)" },
  { code: "CHF", label: "CHF" },
];

function inferCurrencyFromDestinations(destinations: string[]): CurrencyCode {
  const blob = destinations.join(" · ").toLowerCase();
  // Argentina / ciudades comunes
  if (/\b(argentina|buenos aires|mendoza|bariloche|salta|ushuaia|iguaz[uú])\b/i.test(blob)) return "ARS";
  if (/\b(chile|santiago|valpara[ií]so|atacama|puerto varas)\b/i.test(blob)) return "CLP";
  if (/\b(m[eé]xico|mexico|cdmx|ciudad de m[eé]xico|canc[uú]n|oaxaca|yucat[aá]n)\b/i.test(blob)) return "MXN";
  if (/\b(brasil|brazil|rio de janeiro|s[aã]o paulo|salvador)\b/i.test(blob)) return "BRL";
  if (/\b(eeuu|eua|usa|united states|new york|miami|los angeles|san francisco)\b/i.test(blob)) return "USD";
  if (/\b(reino unido|uk|united kingdom|londres|london|edinburgh)\b/i.test(blob)) return "GBP";
  if (/\b(jap[oó]n|japan|tokyo|kyoto|osaka)\b/i.test(blob)) return "JPY";
  if (/\b(canad[aá]|canada|toronto|vancouver|montreal)\b/i.test(blob)) return "CAD";
  if (/\b(australia|sydney|melbourne)\b/i.test(blob)) return "AUD";
  if (/\b(suiza|switzerland|z[uú]rich|geneva|ginebra)\b/i.test(blob)) return "CHF";
  return "EUR";
}

const CATEGORY_KINDS: Array<{
  key: Exclude<Category, "transport">;
  label: string;
  emoji: string;
  color: string;
}> = [
  { key: "culture", label: "Cultura", emoji: "🏛️", color: "#f59e0b" },
  { key: "nature", label: "Naturaleza", emoji: "🌿", color: "#10b981" },
  { key: "viewpoint", label: "Mirador", emoji: "🌄", color: "#0ea5e9" },
  { key: "neighborhood", label: "Barrio", emoji: "🧭", color: "#64748b" },
  { key: "market", label: "Mercado", emoji: "🧺", color: "#f97316" },
  { key: "excursion", label: "Excursión", emoji: "🚌", color: "#2563eb" },
  { key: "gastro_experience", label: "Gastronomía (experiencia)", emoji: "🍷", color: "#db2777" },
  { key: "shopping", label: "Compras", emoji: "🛍️", color: "#a855f7" },
  { key: "night", label: "Noche", emoji: "🌙", color: "#334155" },
];

export default function TripAiPlannerWizard() {
  const router = useRouter();
  const toast = useToast();

  const [step, setStep] = useState<"inputs" | "pois" | "stays" | "preview">("inputs");
  const [tripName, setTripName] = useState("");
  const [places, setPlaces] = useState<string[]>([""]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [baseCurrency, setBaseCurrency] = useState<CurrencyCode>("EUR");
  const [baseCurrencyTouched, setBaseCurrencyTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState<ApiDraft | null>(null);
  const [stays, setStays] = useState<StayRow[]>([]);
  const [selectedPoisByStop, setSelectedPoisByStop] = useState<Record<string, Poi[]>>({});

  const [chatMessages, setChatMessages] = useState<Array<{ role: "user" | "assistant"; text: string }>>([]);
  const [chatInput, setChatInput] = useState("");
  const [activeRules, setActiveRules] = useState<string[]>([]);

  const [hasSavedDraft, setHasSavedDraft] = useState(false);
  const [scopePickerOpen, setScopePickerOpen] = useState(false);
  const [pendingChatText, setPendingChatText] = useState<string>("");
  const [pickedScope, setPickedScope] = useState<ChatScope>({ kind: "all" });
  const [pickedDay, setPickedDay] = useState<number>(1);
  const [pickedFrom, setPickedFrom] = useState<number>(1);
  const [pickedTo, setPickedTo] = useState<number>(2);

  const totalDays = useMemo(() => totalDaysBetween(startDate, endDate), [startDate, endDate]);
  const destinationLabel = useMemo(() => joinTripPlaces(places.map((x) => x.trim()).filter(Boolean)), [places]);
  const inferredCurrency = useMemo(() => inferCurrencyFromDestinations(places.map((x) => x.trim()).filter(Boolean)), [places]);

  useEffect(() => {
    if (!isoOk(startDate)) return;
    if (!endDate || endDate < startDate) setEndDate(startDate);
  }, [startDate]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (baseCurrencyTouched) return;
    setBaseCurrency(inferredCurrency);
  }, [inferredCurrency, baseCurrencyTouched]);

  useEffect(() => {
    try {
      setHasSavedDraft(Boolean(window.localStorage.getItem(DRAFT_STORAGE_KEY)));
    } catch {
      setHasSavedDraft(false);
    }
  }, []);

  const canInputs = useMemo(() => {
    const list = places.map((x) => x.trim()).filter(Boolean);
    if (!list.length) return false;
    if (!isoOk(startDate) || !isoOk(endDate)) return false;
    if (endDate < startDate) return false;
    return true;
  }, [places, startDate, endDate]);

  async function generateDraft(opts?: { regenerateBadOnly?: boolean; targetDayNums?: number[] | null }) {
    const list = places.map((x) => x.trim()).filter(Boolean);
    if (!list.length) return;
    if (!isoOk(startDate) || !isoOk(endDate)) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/trips/ai-planner/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destinations: list,
          start_date: startDate,
          end_date: endDate,
          stays: stays.length ? stays : undefined,
          selectedPoisByStop,
          days: draft?.days || undefined,
          regenerateBadOnly: Boolean(opts?.regenerateBadOnly),
          targetDayNums: Array.isArray(opts?.targetDayNums) ? opts!.targetDayNums : undefined,
          rules: activeRules,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "No se pudo generar el borrador.");
      setDraft(data as ApiDraft);
      setStays(Array.isArray((data as any)?.stays) ? (data as any).stays : []);
      setStep("preview");
      if (!chatMessages.length) {
        setChatMessages([{ role: "assistant", text: "He generado un borrador con lugares reales (OSM) y coordenadas. Dime qué cambiarías por chat y lo ajusto." }]);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo generar el borrador.";
      setError(msg);
      toast.error("Error", msg);
    } finally {
      setLoading(false);
    }
  }

  function onTogglePoi(stop: string, poi: Poi) {
    const key = normalizeStop(stop);
    setSelectedPoisByStop((prev) => {
      const cur = Array.isArray(prev[key]) ? prev[key] : [];
      const exists = cur.some((p) => p.name.toLowerCase() === poi.name.toLowerCase());
      const next = exists ? cur.filter((p) => p.name.toLowerCase() !== poi.name.toLowerCase()) : [...cur, poi];
      return { ...prev, [key]: next.slice(0, 24) };
    });
  }

  // Drag&drop simple HTML5 para orden de stays
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  function handleDragStart(i: number) {
    setDragIdx(i);
  }
  function handleDrop(i: number) {
    if (dragIdx == null || dragIdx === i) return;
    setStays((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(i, 0, moved!);
      return next;
    });
    setDragIdx(null);
  }

  async function createTripFromDraft() {
    if (!draft) return;
    if (!destinationLabel) return;
    const name = (tripName.trim() || `${destinationLabel} (${startDate} → ${endDate})`).trim();
    setLoading(true);
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
          base_currency: baseCurrency,
        }),
      });
      const createPayload = await createRes.json().catch(() => null);
      if (!createRes.ok) throw new Error(createPayload?.error || "No se pudo crear el viaje.");
      const tripId = String(createPayload?.tripId || "");
      if (!tripId) throw new Error("No se pudo crear el viaje (sin id).");

      // Asegura tipos personalizados (si la tabla existe)
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
      const bulkPayload = await bulkRes.json().catch(() => null);
      if (!bulkRes.ok) throw new Error(bulkPayload?.error || "No se pudieron crear los planes.");

      toast.success("Viaje creado", "He creado el viaje y todos sus planes.");
      router.push(`/trip/${encodeURIComponent(tripId)}/plan`);
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo crear el viaje.";
      setError(msg);
      toast.error("No se pudo crear", msg);
    } finally {
      setLoading(false);
    }
  }

  function addRuleFromChat(text: string) {
    const t = text.trim();
    if (!t) return;
    setActiveRules((prev) => {
      const next = [...prev, t].slice(-12);
      return next;
    });
  }

  async function applyChat(text: string, scope: ChatScope) {
    if (!draft) return;
    setChatMessages((prev) => [...prev, { role: "user", text }]);
    addRuleFromChat(text);
    const target = scopeToTargetDays(scope, draft.totalDays);
    setChatMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        text:
          scope.kind === "all"
            ? "Entendido. Aplicaré esta regla al viaje y regeneraré los días necesarios."
            : scope.kind === "day"
              ? `Entendido. Aplicaré esta regla al día ${scope.day}.`
              : `Entendido. Aplicaré esta regla a los días ${scope.from}-${scope.to}.`,
      },
    ]);
    await generateDraft({ regenerateBadOnly: scope.kind === "all", targetDayNums: target });
  }

  async function sendChat() {
    const text = chatInput.trim();
    if (!text) return;
    setChatInput("");
    if (!draft) return;
    const inferred = inferScopeFromText(text, draft.totalDays);
    if (!inferred.scope) {
      setPendingChatText(text);
      setPickedScope({ kind: "all" });
      setPickedDay(1);
      setPickedFrom(1);
      setPickedTo(Math.min(2, draft.totalDays));
      setScopePickerOpen(true);
      return;
    }
    await applyChat(text, inferred.scope);
  }

  const nightsOk = stays.length ? sumNights(stays) === totalDays : true;

  function saveDraftToLocal() {
    if (!draft) return;
    try {
      const payload = {
        version: 1,
        savedAt: new Date().toISOString(),
        inputs: { tripName, places, startDate, endDate, baseCurrency },
        stays,
        selectedPoisByStop,
        draft,
        chatMessages,
        activeRules,
      };
      window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
      setHasSavedDraft(true);
      toast.success("Borrador guardado", "Puedes retomarlo más tarde desde este mismo flujo.");
    } catch (e) {
      toast.error("No se pudo guardar", e instanceof Error ? e.message : "Error guardando borrador");
    }
  }

  function loadDraftFromLocal() {
    try {
      const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!raw) return;
      const payload = JSON.parse(raw);
      const inputs = payload?.inputs || {};
      setTripName(String(inputs.tripName || ""));
      setPlaces(Array.isArray(inputs.places) ? inputs.places : [""]);
      setStartDate(String(inputs.startDate || ""));
      setEndDate(String(inputs.endDate || ""));
      if (inputs.baseCurrency) {
        setBaseCurrency(String(inputs.baseCurrency) as CurrencyCode);
        setBaseCurrencyTouched(true);
      }
      setStays(Array.isArray(payload?.stays) ? payload.stays : []);
      setSelectedPoisByStop(payload?.selectedPoisByStop && typeof payload.selectedPoisByStop === "object" ? payload.selectedPoisByStop : {});
      setDraft(payload?.draft || null);
      setChatMessages(Array.isArray(payload?.chatMessages) ? payload.chatMessages : []);
      setActiveRules(Array.isArray(payload?.activeRules) ? payload.activeRules : []);
      setStep(payload?.draft ? "preview" : "inputs");
      toast.success("Borrador cargado", "He restaurado tu borrador guardado.");
    } catch (e) {
      toast.error("No se pudo cargar", e instanceof Error ? e.message : "Error cargando borrador");
    }
  }

  function clearSavedDraft() {
    try {
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
      setHasSavedDraft(false);
      toast.success("Borrador eliminado", "He borrado el borrador guardado.");
    } catch {
      setHasSavedDraft(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div className="mb-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Planificador IA (borrador validable)</h1>
        <p className="mt-2 text-slate-600">
          Genera planes con lugares reales (OSM) y coordenadas. Sin “paseo por la ciudad” ni comidas genéricas.
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{error}</div>
      ) : null}

      {step === "inputs" ? (
        <div className="card-soft p-6 space-y-4">
          {hasSavedDraft ? (
            <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-950">
              Tienes un borrador guardado.
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className="btn-secondary" onClick={loadDraftFromLocal}>
                  Cargar borrador
                </button>
                <button type="button" className="btn-secondary" onClick={clearSavedDraft}>
                  Borrar borrador
                </button>
              </div>
            </div>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-extrabold text-slate-900">Nombre del viaje (opcional)</label>
              <input
                value={tripName}
                onChange={(e) => setTripName(e.target.value)}
                placeholder={destinationLabel && isoOk(startDate) && isoOk(endDate) ? `${destinationLabel} (${startDate} → ${endDate})` : "Ej. Argentina 2026"}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-extrabold text-slate-900">Moneda</label>
              <select
                value={baseCurrency}
                onChange={(e) => {
                  setBaseCurrency(e.target.value as CurrencyCode);
                  setBaseCurrencyTouched(true);
                }}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-slate-500"
              >
                {CURRENCY_OPTIONS.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.label}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-xs font-semibold text-slate-500">
                Sugerida por destino: {inferredCurrency} {baseCurrencyTouched ? "(manual)" : "(auto)"}
              </div>
            </div>
            <div className="md:col-span-2">
              <TripPlacesFields places={places} onChange={setPlaces} />
            </div>
            <div>
              <label className="mb-1 block text-sm font-extrabold text-slate-900">Fecha inicio</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-extrabold text-slate-900">Fecha fin</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} min={startDate || undefined} className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500" />
              <div className="mt-1 text-xs font-semibold text-slate-500">Total: {totalDays} días</div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!canInputs || loading}
              onClick={async () => {
                setStep("preview");
                await generateDraft({ regenerateBadOnly: false });
              }}
              className="btn-primary disabled:opacity-50"
            >
              Generar borrador
            </button>
          </div>
        </div>
      ) : null}

      {step === "preview" && draft ? (
        <div className="space-y-4">
          <div className="card-soft p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-extrabold text-slate-900">Estructura (noches y orden)</div>
                <div className="mt-1 text-xs font-semibold text-slate-600">
                  Arrastra destinos para reordenar y edita noches. Debe sumar {draft.totalDays}.
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" disabled={loading} onClick={saveDraftToLocal} className="btn-secondary disabled:opacity-50">
                  Guardar borrador
                </button>
                {hasSavedDraft ? (
                  <button type="button" disabled={loading} onClick={loadDraftFromLocal} className="btn-secondary disabled:opacity-50">
                    Cargar borrador
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => generateDraft({ regenerateBadOnly: true })}
                  className="btn-secondary disabled:opacity-50"
                  title="Rehacer solo días malos (M1–M5)"
                >
                  Volver a generar (solo días malos)
                </button>
                <button type="button" disabled={loading || !nightsOk} onClick={createTripFromDraft} className="btn-primary disabled:opacity-50">
                  Crear viaje
                </button>
              </div>
            </div>

            {!nightsOk ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                El número de noches no coincide con las fechas. Suma actual: {sumNights(stays)} / {draft.totalDays}.
              </div>
            ) : null}

            <div className="grid gap-2">
              {(stays.length ? stays : draft.stays).map((s, i) => (
                <div
                  key={`${s.stop}-${i}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2"
                  draggable
                  onDragStart={() => handleDragStart(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(i)}
                  title="Arrastra para reordenar"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-extrabold text-slate-900">{s.stop}</div>
                    <div className="text-xs font-semibold text-slate-500">Drag & drop</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-600">Noches</span>
                    <input
                      inputMode="numeric"
                      value={String(s.nights)}
                      onChange={(e) => {
                        const n = Math.max(1, Math.min(60, Math.round(Number(e.target.value || "1"))));
                        setStays((prev) => prev.map((x, idx) => (idx === i ? { ...x, nights: n } : x)));
                      }}
                      className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm font-extrabold text-slate-900"
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={loading || !nightsOk}
                onClick={async () => {
                  await generateDraft({ regenerateBadOnly: false });
                }}
                className="btn-secondary disabled:opacity-50"
                title="Regenerar aplicando el orden/noches actuales"
              >
                Aplicar estructura y regenerar
              </button>
            </div>
          </div>

          <div className="card-soft p-5 space-y-3">
            <div className="text-sm font-extrabold text-slate-900">Imprescindibles (opcional)</div>
            <div className="text-xs font-semibold text-slate-600">Selecciona POIs concretos para priorizarlos (con coordenadas). No bloquea el flujo.</div>
            <div className="space-y-3">
              {Object.entries(draft.suggestions || {}).map(([stop, groups]) => (
                <div key={stop} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="text-sm font-extrabold text-slate-900">{stop}</div>
                  <div className="mt-2 space-y-2">
                    {groups.map((g) => (
                      <div key={`${stop}-${g.category}`}>
                        <div className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-500">{g.category}</div>
                        <div className="mt-1 flex flex-wrap gap-2">
                          {g.pois.slice(0, 12).map((p) => {
                            const picked = (selectedPoisByStop[stop] || []).some((x) => x.name.toLowerCase() === p.name.toLowerCase());
                            return (
                              <button
                                key={p.name}
                                type="button"
                                onClick={() => onTogglePoi(stop, p)}
                                className={`rounded-full border px-3 py-1 text-xs font-extrabold ${
                                  picked ? "border-violet-300 bg-violet-50 text-violet-900" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                                }`}
                                title={`${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`}
                              >
                                {p.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card-soft p-5 space-y-3">
            <div className="text-sm font-extrabold text-slate-900">Borrador (tarjetas)</div>
            <div className="text-xs font-semibold text-slate-600">Esto es lo que se guardará en Plan al crear el viaje.</div>
            <div className="space-y-4">
              {draft.days.map((d) => (
                <div key={d.day} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="text-sm font-extrabold text-slate-900">
                      Día {d.day} · {d.date} · {d.base}
                    </div>
                    <div className="text-xs font-semibold text-slate-500">{(d.items || []).length} planes</div>
                  </div>
                  <div className="mt-3 space-y-3">
                    {(d.items || []).map((it, idx) => (
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
                </div>
              ))}
            </div>
          </div>

          <div className="card-soft p-5 space-y-3">
            <div className="text-sm font-extrabold text-slate-900">Chat de ajustes</div>
            <div className="text-xs font-semibold text-slate-600">
              Pide cambios. Se guardarán como “reglas activas”. Si el alcance es ambiguo, te pediré si aplica a un día, rango o todo el viaje.
            </div>

            {activeRules.length ? (
              <div className="flex flex-wrap gap-2">
                {activeRules.map((r, i) => (
                  <button
                    key={`${r}-${i}`}
                    type="button"
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-extrabold text-slate-700"
                    title="Regla activa"
                    onClick={() => {
                      // toggle off
                      setActiveRules((prev) => prev.filter((x) => x !== r));
                    }}
                  >
                    {r} ×
                  </button>
                ))}
              </div>
            ) : null}

            <div className="max-h-[240px] overflow-auto rounded-xl border border-slate-200 bg-white p-3">
              <div className="space-y-2">
                {chatMessages.map((m, idx) => (
                  <div key={idx} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${m.role === "user" ? "bg-slate-900 text-white" : "bg-slate-50 text-slate-900"}`}>
                      {m.text}
                    </div>
                  </div>
                ))}
                {!chatMessages.length ? (
                  <div className="text-xs font-semibold text-slate-500">Escribe un cambio, por ejemplo: “Evita museos”, “No actividades después de las 17:00”, “Más naturaleza”</div>
                ) : null}
              </div>
            </div>

            <div className="flex gap-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void sendChat();
                  }
                }}
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
                placeholder="Ej. No actividades más allá de las 17:00"
              />
              <button type="button" disabled={loading} onClick={sendChat} className="btn-primary disabled:opacity-50">
                Enviar
              </button>
            </div>
          </div>

          {scopePickerOpen ? (
            <div
              className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-4 sm:items-center"
              role="presentation"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setScopePickerOpen(false);
              }}
            >
              <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl" role="dialog" aria-modal="true">
                <div className="text-sm font-extrabold text-slate-900">¿A qué días se aplica?</div>
                <div className="mt-1 text-xs font-semibold text-slate-600">
                  No he podido inferir el alcance del mensaje. Elige dónde aplicarlo.
                </div>

                <div className="mt-4 space-y-3">
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <input type="radio" checked={pickedScope.kind === "all"} onChange={() => setPickedScope({ kind: "all" })} />
                    Todo el viaje
                  </label>
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <input type="radio" checked={pickedScope.kind === "day"} onChange={() => setPickedScope({ kind: "day", day: pickedDay })} />
                    Solo un día
                    <input
                      inputMode="numeric"
                      value={String(pickedDay)}
                      onChange={(e) => setPickedDay(Math.max(1, Math.min(draft.totalDays, Math.round(Number(e.target.value || "1")))))}
                      className="ml-auto w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm font-extrabold"
                    />
                  </label>
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <input
                      type="radio"
                      checked={pickedScope.kind === "range"}
                      onChange={() => setPickedScope({ kind: "range", from: pickedFrom, to: pickedTo })}
                    />
                    Rango de días
                    <div className="ml-auto flex items-center gap-2">
                      <input
                        inputMode="numeric"
                        value={String(pickedFrom)}
                        onChange={(e) => setPickedFrom(Math.max(1, Math.min(draft.totalDays, Math.round(Number(e.target.value || "1")))))}
                        className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm font-extrabold"
                      />
                      <span className="text-xs font-semibold text-slate-500">a</span>
                      <input
                        inputMode="numeric"
                        value={String(pickedTo)}
                        onChange={(e) => setPickedTo(Math.max(1, Math.min(draft.totalDays, Math.round(Number(e.target.value || "2")))))}
                        className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm font-extrabold"
                      />
                    </div>
                  </label>
                </div>

                <div className="mt-5 flex gap-2">
                  <button type="button" className="btn-secondary" onClick={() => setScopePickerOpen(false)}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={async () => {
                      const scope =
                        pickedScope.kind === "all"
                          ? ({ kind: "all" } as ChatScope)
                          : pickedScope.kind === "day"
                            ? ({ kind: "day", day: pickedDay } as ChatScope)
                            : ({ kind: "range", from: pickedFrom, to: pickedTo } as ChatScope);
                      setScopePickerOpen(false);
                      const text = pendingChatText;
                      setPendingChatText("");
                      await applyChat(text, scope);
                    }}
                  >
                    Aplicar
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={() => { setDraft(null); setStep("inputs"); }}>
              Empezar de nuevo
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

