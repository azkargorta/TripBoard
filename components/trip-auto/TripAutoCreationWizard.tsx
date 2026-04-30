"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import type { TripCreationIntent, ExecutableItineraryPayload } from "@/lib/trip-ai/tripCreationTypes";
import { joinTripPlaces } from "@/lib/trip-places";
import TripPlacesFields from "@/components/dashboard/TripPlacesFields";
import { buildTravelCurrencySelectOptions } from "@/lib/travel-currencies";
import TripBoardLogo from "@/components/brand/TripBoardLogo";

type Pace = "relajado" | "equilibrado" | "intenso";
type TravelTheme = "aventura" | "relax" | "gastronómico" | "cultural" | "naturaleza" | "fiesta" | "shopping" | "romántico";
const THEME_OPTIONS: Array<{ id: TravelTheme; label: string }> = [
  { id: "aventura", label: "Aventura" },
  { id: "relax", label: "Relax" },
  { id: "gastronómico", label: "Gastronómico" },
  { id: "cultural", label: "Cultural" },
  { id: "naturaleza", label: "Naturaleza" },
  { id: "fiesta", label: "Fiesta" },
  { id: "shopping", label: "Shopping" },
  { id: "romántico", label: "Romántico" },
];

function isoOk(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

async function readJsonResponse<T = any>(res: Response): Promise<{ data: T | null; raw: string }> {
  const raw = await res.text().catch(() => "");
  const trimmed = raw.trim();
  if (!trimmed) return { data: null, raw };
  try {
    return { data: JSON.parse(trimmed) as T, raw };
  } catch {
    if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html") || trimmed.includes("<body")) {
      throw new Error("La respuesta del servidor no es JSON (posible sesión caducada o error HTML).");
    }
    throw new Error(`La respuesta del servidor no es JSON. Inicio: "${trimmed.replace(/\s+/g, " ").slice(0, 140)}"`);
  }
}

function defaultTripName(destinations: string[], startDate: string, endDate: string) {
  const dest = joinTripPlaces(destinations) || "Viaje";
  return `${dest} (${startDate} → ${endDate})`;
}

export default function TripAutoCreationWizard() {
  const router = useRouter();
  const toast = useToast();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Básicos
  const [routeCities, setRouteCities] = useState<string[]>([""]);
  const [forceOrder, setForceOrder] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [tripName, setTripName] = useState("");
  const [baseCurrency, setBaseCurrency] = useState("EUR");

  // Estilo
  const [travelersType, setTravelersType] = useState<NonNullable<TripCreationIntent["travelersType"]>>("couple");
  const [travelersCount, setTravelersCount] = useState<number | "">(2);
  const [pace, setPace] = useState<Pace>("equilibrado");
  const [budgetLevel, setBudgetLevel] = useState<NonNullable<TripCreationIntent["budgetLevel"]>>("medium");
  const [themes, setThemes] = useState<TravelTheme[]>(["cultural"]);
  const [notes, setNotes] = useState("");

  // Chat guiado (flujo de preguntas)
  type ChatRole = "assistant" | "user";
  type ChatStage =
    | "intro"
    | "travelersType"
    | "travelersCount"
    | "pace"
    | "budget"
    | "themes"
    | "avoid"
    | "maxItems"
    | "constraints"
    | "mustSee"
    | "done";
  type ChatMessage = {
    id: string;
    role: ChatRole;
    text: string;
    quickReplies?: string[];
  };
  const [chatStage, setChatStage] = useState<ChatStage>("intro");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");

  const [avoidRaw, setAvoidRaw] = useState("");
  const [maxItemsPerDay, setMaxItemsPerDay] = useState<number | null>(null);
  const [aiParsing, setAiParsing] = useState(false);

  // Visitas propuestas (chips)
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const [mustSee, setMustSee] = useState<string[]>([]);

  // Preview
  const [itinerary, setItinerary] = useState<ExecutableItineraryPayload | null>(null);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiProgress, setAiProgress] = useState<{ done: number; total: number } | null>(null);
  const [aiPromptLog, setAiPromptLog] = useState<Array<{ dayOffset: number; dayCount: number; prompts: string[] }>>([]);
  const [createStage, setCreateStage] = useState(0);

  // Confirmación (reparto de noches)
  const [allocationLoading, setAllocationLoading] = useState(false);
  const [allocationError, setAllocationError] = useState<string | null>(null);
  const [cityStays, setCityStays] = useState<Array<{ city: string; days: number }>>([]);

  const destinationLabel = useMemo(() => joinTripPlaces(routeCities), [routeCities]);
  const currencyOptions = useMemo(() => buildTravelCurrencySelectOptions(destinationLabel), [destinationLabel]);

  function pushChatMessage(m: Omit<ChatMessage, "id">) {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setChatMessages((prev) => [...prev, { ...m, id }]);
  }

  function nextStageFromState(): ChatStage {
    if (!travelersType) return "travelersType";
    if (!travelersCount || (typeof travelersCount === "number" && travelersCount < 1)) return "travelersCount";
    if (!pace) return "pace";
    if (!budgetLevel) return "budget";
    if (!themes.length) return "themes";
    if (!avoidRaw.trim()) return "avoid";
    if (!maxItemsPerDay) return "maxItems";
    return "constraints";
  }

  function askForStage(stage: ChatStage) {
    if (stage === "travelersType") {
      pushChatMessage({
        role: "assistant",
        text: "¿Con quién viajas?",
        quickReplies: ["En pareja", "Con amigos", "Con familia", "Solo"],
      });
      return;
    }
    if (stage === "travelersCount") {
      pushChatMessage({ role: "assistant", text: "¿Cuántas personas sois? (número)" });
      return;
    }
    if (stage === "pace") {
      pushChatMessage({
        role: "assistant",
        text: "¿Qué ritmo quieres?",
        quickReplies: ["Relajado", "Equilibrado", "Intenso"],
      });
      return;
    }
    if (stage === "budget") {
      pushChatMessage({
        role: "assistant",
        text: "¿Qué presupuesto prefieres?",
        quickReplies: ["Bajo", "Medio", "Alto"],
      });
      return;
    }
    if (stage === "themes") {
      pushChatMessage({
        role: "assistant",
        text:
          '¿Qué tipo de viaje quieres? Elige 1 o varios (pulsa opciones) y cuando termines escribe "listo".',
        quickReplies: ["Relax", "Aventura", "Gastronómico", "Museos", "Excursiones", "Naturaleza"],
      });
      return;
    }
    if (stage === "avoid") {
      pushChatMessage({
        role: "assistant",
        text:
          "¿Qué quieres evitar en el plan? Puedes elegir varias opciones o escribirlo. Si no quieres evitar nada, pulsa 'Siguiente'.",
        quickReplies: ["Comidas genéricas", "Vida nocturna", "Museos", "Compras", "Madrugar", "Traslados largos", "Siguiente →"],
      });
      return;
    }
    if (stage === "maxItems") {
      pushChatMessage({
        role: "assistant",
        text:
          "¿Cuántas actividades MÁXIMO por día quieres? (número). Ejemplo: 4 (si hay traslados largos, pondré menos).",
        quickReplies: ["3", "4", "5", "6"],
      });
      return;
    }
    if (stage === "constraints") {
      pushChatMessage({
        role: "assistant",
        text:
          'Cuéntame tus preferencias/restricciones en una frase. Ejemplos: "no madrugar", "últimos 2 días en Buenos Aires", "minimizar vuelos", "evitar museos", "quiero bodegas".',
        quickReplies: ["No madrugar", "Últimos 2 días en Buenos Aires", "Minimizar vuelos", "Acepto vuelos internos", "Evitar museos"],
      });
      return;
    }
    if (stage === "mustSee") {
      pushChatMessage({
        role: "assistant",
        text:
          'Ahora añade imprescindibles (ciudades/regiones) desde "Visitas propuestas" o escríbelos aquí. Cuando termines, responde "listo".',
      });
      return;
    }
    if (stage === "done") {
      pushChatMessage({
        role: "assistant",
        text: 'Perfecto. Ya tengo lo necesario. Pulsa "Generar propuesta de ruta" para ver y ajustar las noches por destino.',
      });
    }
  }

  function parseAndApplyChatAnswer(stage: ChatStage, raw: string) {
    const t = String(raw || "").trim();
    if (!t) return;

    if (stage === "travelersType") {
      const lc = t.toLowerCase();
      if (lc.includes("pareja")) setTravelersType("couple");
      else if (lc.includes("amig")) setTravelersType("friends");
      else if (lc.includes("famil")) setTravelersType("family");
      else if (lc.includes("solo")) setTravelersType("solo");
      return;
    }
    if (stage === "travelersCount") {
      const n = Number(String(t).replace(/[^\d]/g, ""));
      if (Number.isFinite(n) && n >= 1) setTravelersCount(Math.max(1, Math.min(50, Math.round(n))));
      return;
    }
    if (stage === "pace") {
      const lc = t.toLowerCase();
      if (lc.includes("relaj")) setPace("relajado");
      else if (lc.includes("equil") || lc.includes("moder")) setPace("equilibrado");
      else if (lc.includes("inten")) setPace("intenso");
      return;
    }
    if (stage === "budget") {
      const lc = t.toLowerCase();
      if (lc.includes("baj")) setBudgetLevel("low");
      else if (lc.includes("alt")) setBudgetLevel("high");
      else setBudgetLevel("medium");
      return;
    }
    if (stage === "themes") {
      const lc = t.toLowerCase();
      if (lc === "listo" || lc === "ok" || lc === "vale") return;

      // Respuestas rápidas (toggle)
      const mapQuick = (x: string): TravelTheme | null => {
        const k = x.toLowerCase();
        if (k.includes("relax")) return "relax";
        if (k.includes("aventura")) return "aventura";
        if (k.includes("gastron")) return "gastronómico";
        if (k.includes("museo")) return "cultural";
        if (k.includes("excurs")) return "aventura";
        if (k.includes("naturaleza")) return "naturaleza";
        return null;
      };
      const one = mapQuick(t);
      if (one) {
        toggleTheme(one);
        return;
      }

      // Fallback: parse por comas
      const parts = t
        .split(/[,;|·]+/g)
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean);
      const picked: TravelTheme[] = [];
      for (const p of parts) {
        const opt = THEME_OPTIONS.find((o) => o.label.toLowerCase() === p || o.id === (p as any));
        if (opt) picked.push(opt.id);
      }
      if (picked.length) setThemes(Array.from(new Set(picked)));
      return;
    }
    if (stage === "avoid") {
      const lc = t.toLowerCase();
      const AVOID_SKIP = ["listo", "ok", "vale", "siguiente", "ninguno", "nada", "no quiero", "sin restricciones"];
      if (AVOID_SKIP.some((w) => lc === w || lc.startsWith(w))) return;
      setAvoidRaw((prev) => {
        if (!prev.trim()) return t;
        if (prev.toLowerCase().includes(lc)) return prev;
        return `${prev}\n${t}`;
      });
      return;
    }
    if (stage === "maxItems") {
      const n = Number(String(t).replace(/[^\d]/g, ""));
      if (Number.isFinite(n) && n >= 1) setMaxItemsPerDay(Math.max(1, Math.min(12, Math.round(n))));
      return;
    }
    if (stage === "constraints") {
      setNotes((prev) => (prev ? `${prev}\n${t}` : t));
      return;
    }
    if (stage === "mustSee") {
      const lc = t.toLowerCase();
      if (lc === "listo" || lc === "ok" || lc === "vale") return;
      const parts = t
        .split(/[,;|·]+/g)
        .map((x) => x.trim())
        .filter(Boolean);
      for (const p of parts) addMustSee(p);
    }
  }

  function applyParsedFields(fields: any) {
    if (!fields || typeof fields !== "object" || Array.isArray(fields)) return;
    const VALID_TYPES = ["solo", "couple", "friends", "family"];
    const VALID_BUDGETS = ["low", "medium", "high"];
    const VALID_PACES = ["relajado", "equilibrado", "intenso"];
    const VALID_THEMES: TravelTheme[] = ["aventura", "relax", "gastronómico", "cultural", "naturaleza", "fiesta", "shopping", "romántico"];

    if (VALID_TYPES.includes(fields.travelersType)) setTravelersType(fields.travelersType);
    if (typeof fields.travelersCount === "number" && Number.isFinite(fields.travelersCount) && fields.travelersCount >= 1) {
      setTravelersCount(Math.max(1, Math.min(50, Math.round(fields.travelersCount))));
    }
    if (VALID_BUDGETS.includes(fields.budgetLevel)) setBudgetLevel(fields.budgetLevel);
    if (VALID_PACES.includes(fields.pace)) setPace(fields.pace as Pace);
    if (Array.isArray(fields.travelStyle) && fields.travelStyle.length) {
      const extracted = (fields.travelStyle as string[]).filter((t) => VALID_THEMES.includes(t as TravelTheme)) as TravelTheme[];
      if (extracted.length) setThemes((prev) => Array.from(new Set([...prev, ...extracted])));
    }
    if (Array.isArray(fields.avoidKeywords)) {
      for (const kw of fields.avoidKeywords) {
        const t = String(kw || "").trim();
        if (!t) continue;
        setAvoidRaw((prev) => {
          if (!prev.trim()) return t;
          if (prev.toLowerCase().includes(t.toLowerCase())) return prev;
          return `${prev}\n${t}`;
        });
      }
    }
    if (typeof fields.maxItemsPerDay === "number" && Number.isFinite(fields.maxItemsPerDay)) {
      setMaxItemsPerDay(Math.max(1, Math.min(12, Math.round(fields.maxItemsPerDay))));
    }
    if (typeof fields.notes === "string" && fields.notes.trim()) {
      const t = fields.notes.trim();
      setNotes((prev) => (prev ? `${prev}\n${t}` : t));
    }
    if (Array.isArray(fields.mustSee)) {
      for (const item of fields.mustSee) {
        const t = String(item || "").trim();
        if (t) addMustSee(t);
      }
    }
  }

  async function parseWithAi(text: string) {
    setAiParsing(true);
    try {
      const res = await fetch("/api/trips/auto-plan/parse-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const { data } = await readJsonResponse<any>(res);
      if (res.ok && data?.fields) applyParsedFields(data.fields);
    } catch {
      // Silent: keyword parser already handled the stage
    } finally {
      setAiParsing(false);
    }
  }

  function sendChat(textRaw: string, opts?: { skipAiParse?: boolean }) {
    const text = String(textRaw || "").trim();
    if (!text) return;
    pushChatMessage({ role: "user", text });
    parseAndApplyChatAnswer(chatStage, text);

    // For free-text (non-quick-reply) messages, call Gemini to extract structured fields.
    // Quick replies (skipAiParse=true) are already handled precisely by the keyword parser.
    const DONE_WORDS = ["listo", "ok", "vale"];
    if (!opts?.skipAiParse && text.length >= 5 && !DONE_WORDS.includes(text.toLowerCase())) {
      void parseWithAi(text);
    }

    if (chatStage === "themes") {
      const lc = text.toLowerCase();
      // En esta etapa el usuario puede ir "toggling" estilos; solo avanzamos cuando diga "listo".
      if (lc === "listo" || lc === "ok" || lc === "vale") {
        const st = nextStageFromState();
        setChatStage(st);
        askForStage(st);
      }
      return;
    }

    if (chatStage === "avoid") {
      const lc = text.toLowerCase();
      const ADVANCE = ["listo", "ok", "vale", "siguiente", "ninguno", "nada", "no quiero", "sin restricciones"];
      if (ADVANCE.some((w) => lc === w || lc.startsWith(w))) {
        // Bypass nextStageFromState() — avoidRaw is optional so we go directly to maxItems
        setChatStage("maxItems");
        askForStage("maxItems");
      }
      return;
    }

    if (chatStage === "maxItems") {
      // Advance as soon as we get a number or a skip word (state update is async, can't rely on nextStageFromState)
      const n = Number(String(text).replace(/[^\d]/g, ""));
      const hasNumber = Number.isFinite(n) && n >= 1;
      const SKIP = ["listo", "ok", "vale", "siguiente", "ninguno", "nada", "sin límite"];
      const isSkip = SKIP.some((w) => text.toLowerCase().includes(w));
      if (hasNumber || isSkip) {
        setChatStage("constraints");
        askForStage("constraints");
      }
      return;
    }

    // Avance de etapa
    if (chatStage === "mustSee") {
      const lc = text.toLowerCase();
      if (lc === "listo" || lc === "ok" || lc === "vale") {
        setChatStage("done");
        askForStage("done");
      }
      return;
    }

    const st = nextStageFromState();
    if (st !== chatStage) {
      setChatStage(st);
      askForStage(st);
      return;
    }

    // Si ya estamos en constraints y el usuario respondió, saltamos a mustSee.
    if (chatStage === "constraints") {
      setChatStage("mustSee");
      askForStage("mustSee");
      return;
    }
  }

  const canStep1 = useMemo(() => {
    if (!isoOk(startDate) || !isoOk(endDate)) return false;
    if (endDate < startDate) return false; // se permite 1 día
    const list = routeCities.map((x) => x.trim()).filter(Boolean);
    return list.length >= 1;
  }, [routeCities, startDate, endDate]);

  const canStep2 = useMemo(() => {
    if (!canStep1) return false;
    if (!travelersType) return false;
    if (typeof travelersCount === "number" && travelersCount < 1) return false;
    return true;
  }, [canStep1, travelersCount, travelersType]);

  const canConfirm = useMemo(() => {
    if (!canStep2) return false;
    if (!cityStays.length) return false;
    const sum = cityStays.reduce((a, b) => a + (Number(b.days) || 0), 0);
    return sum >= 1;
  }, [canStep2, cityStays]);

  const intent = useMemo((): TripCreationIntent => {
    const cities = routeCities.map((x) => x.trim()).filter(Boolean);
    const main = cities[0] || null;
    const startCity = cities.length >= 2 ? cities[0]! : null;
    const endCity = cities.length >= 2 ? cities[cities.length - 1]! : null;
    const mustSeeClean = mustSee.map((x) => x.trim()).filter(Boolean);
    // Importante: si el usuario añade "visitas propuestas" (ciudades/regiones), queremos que afecten al recorrido.
    // Por eso las incluimos también en `destination` (estructura baseCity), y dejamos `mustSee` para POIs concretos.
    const destinationStops = [...cities, ...mustSeeClean];
    const manualNoches = cityStays.length ? `Noches: ${cityStays.map((s) => `${s.city}=${s.days}`).join("; ")}` : "";
    const avoidLine = avoidRaw.trim() ? `Evitar: ${avoidRaw.trim().replace(/\n+/g, ", ")}` : "";
    const maxLine = maxItemsPerDay ? `Máximo actividades/día: ${maxItemsPerDay}` : "";
    return {
      destination: joinTripPlaces(destinationStops) || joinTripPlaces(cities) || main,
      startDate: isoOk(startDate) ? startDate : null,
      endDate: isoOk(endDate) ? endDate : null,
      startLocation: startCity,
      endLocation: endCity,
      travelersType,
      travelersCount: typeof travelersCount === "number" ? travelersCount : null,
      budgetLevel,
      travelStyle: themes.length ? themes : [],
      wantsRouteOptimization: !forceOrder,
      mustSee: mustSeeClean.length ? mustSeeClean.slice(0, 18) : [],
      // traducimos el ritmo/tema/notas a constraints para que el modelo lo use como pista
      constraints: [
        `Ritmo: ${pace}`,
        themes.length ? `Temas: ${themes.join(", ")}` : "",
        avoidLine,
        maxLine,
        manualNoches,
        notes.trim() ? `Notas del usuario: ${notes.trim()}` : "",
      ].filter(Boolean),
      suggestedTripName: tripName.trim() || null,
    };
  }, [budgetLevel, routeCities, endDate, forceOrder, pace, startDate, travelersCount, travelersType, tripName, themes, notes, mustSee, cityStays, avoidRaw, maxItemsPerDay]);

  async function computeAllocation() {
    if (allocationLoading) return;
    setAllocationLoading(true);
    setAllocationError(null);
    try {
      const res = await fetch("/api/trips/auto-plan/allocate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent }),
      });
      const { data } = await readJsonResponse<any>(res);
      if (!res.ok) throw new Error(data?.error || "No se pudo calcular el reparto de noches.");
      const stays = Array.isArray(data?.structure?.cityStays) ? data.structure.cityStays : [];
      const parsed = stays
        .map((s: any) => ({ city: String(s?.city || "").trim(), days: Number(s?.days) || 1 }))
        .filter((s: any) => s.city);
      setCityStays(parsed);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo calcular el reparto de noches.";
      setAllocationError(msg);
      setCityStays([]);
    } finally {
      setAllocationLoading(false);
    }
  }

  function addMustSee(label: string) {
    const t = String(label || "").trim();
    if (!t) return;
    const lc = t.toLowerCase();
    // Evita que frases del chat tipo "Acepto vuelos internos" acaben como destinos
    if (/(acepto|minimizar|evitar|no madrugar|madrugar|vuelos?|presupuesto|ritmo|temas:|notas)/i.test(lc)) return;
    setMustSee((prev) => {
      const list = prev.map((x) => x.trim()).filter(Boolean);
      if (list.some((x) => x.toLowerCase() === t.toLowerCase())) return list;
      return [...list, t].slice(0, 24);
    });
  }

  function removeMustSee(label: string) {
    const t = String(label || "").trim().toLowerCase();
    setMustSee((prev) => prev.filter((x) => x.trim().toLowerCase() !== t));
  }

  async function loadSuggestions() {
    const main = routeCities.map((x) => x.trim()).filter(Boolean)[0] || "";
    if (!main) return;
    setSuggestionsLoading(true);
    setSuggestionsError(null);
    try {
      const res = await fetch("/api/trips/auto-plan/suggest-visits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination: main, limit: 42 }),
      });
      const { data } = await readJsonResponse<any>(res);
      if (!res.ok) throw new Error(data?.error || "No se pudieron cargar sugerencias.");
      const list = Array.isArray(data?.suggestions) ? data.suggestions.map((x: any) => String(x || "").trim()).filter(Boolean) : [];
      setSuggestions(list.slice(0, 42));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudieron cargar sugerencias.";
      setSuggestionsError(msg);
      setSuggestions([]);
    } finally {
      setSuggestionsLoading(false);
    }
  }

  // Autocarga de sugerencias en el paso 2 cuando hay destino.
  useEffect(() => {
    if (step !== 2) return;
    if (suggestionsLoading) return;
    const main = routeCities.map((x) => x.trim()).filter(Boolean)[0] || "";
    if (!main) return;
    if (suggestions.length) return;
    void loadSuggestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, destinationLabel]);

  // Inicializa el chat al entrar al paso 2 y guía el flujo.
  useEffect(() => {
    if (step !== 2) return;
    if (!chatMessages.length) {
      pushChatMessage({
        role: "assistant",
        text: "Vamos a configurar tu viaje. Te haré unas preguntas rápidas.",
      });
      const st = nextStageFromState();
      setChatStage(st);
      askForStage(st);
      return;
    }
    // Si el usuario ya contestó algo, seguimos a la siguiente pregunta si aplica.
    const st = nextStageFromState();
    if (chatStage !== "mustSee" && chatStage !== "done" && st !== chatStage) {
      setChatStage(st);
      askForStage(st);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    if (step !== 2) return;
    if (chatStage === "constraints") {
      // después de restricciones, pasamos a mustSee automáticamente
      if (notes.trim().length) {
        setChatStage("mustSee");
        askForStage("mustSee");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, step]);

  function toggleTheme(t: TravelTheme) {
    setThemes((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      const has = list.includes(t);
      const next = has ? list.filter((x) => x !== t) : [...list, t];
      // Evitamos quedarse con 0 para no perder señal; si el usuario quita todo, volvemos a cultural.
      return next.length ? next : ["cultural"];
    });
  }

  async function previewPlan() {
    if (aiGenerating || loading) return;
    setError(null);
    setItinerary(null);
    setStep(4);
    await generateAllDaysWithAi();
  }

  function tripTotalDays() {
    if (itinerary?.days?.length) return itinerary.days.length;
    if (isoOk(startDate) && isoOk(endDate)) {
      const a = new Date(`${startDate}T12:00:00Z`).getTime();
      const b = new Date(`${endDate}T12:00:00Z`).getTime();
      const diff = Math.round((b - a) / (86400 * 1000)) + 1;
      return Math.max(1, diff);
    }
    return 1;
  }

  async function generateAllDaysWithAi() {
    if (aiGenerating) return;
    setAiGenerating(true);
    setError(null);
    try {
      const total = tripTotalDays();
      setAiProgress({ done: 0, total });
      setAiPromptLog([]);

      const base: ExecutableItineraryPayload =
        itinerary?.version === 1 && Array.isArray(itinerary.days) ? itinerary : { version: 1, title: "Itinerario", travelMode: "driving", days: [] };
      const dayMap = new Map<number, any>();
      for (const d of base.days || []) if (typeof d?.day === "number") dayMap.set(d.day, d);

      const placeholderDay = (dayNum: number) => {
        const date = isoOk(startDate) ? new Date(`${startDate}T12:00:00Z`) : null;
        const d = date ? new Date(date.getTime() + (dayNum - 1) * 86400 * 1000) : null;
        const iso =
          d && Number.isFinite(d.getTime())
            ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`
            : null;
        return {
          day: dayNum,
          date: iso,
          items: [
            {
              title: "Día pendiente de generar con IA",
              activity_kind: "visit",
              place_name: destinationLabel || "Destino",
              address: destinationLabel || "Destino",
              start_time: "10:00",
              notes: "Este día falló por timeout. Pulsa 'Regenerar con IA' para reintentarlo.",
            },
          ],
        };
      };

      const PACE_CONFIG = {
        relajado: { min: 3, max: 4 },
        equilibrado: { min: 4, max: 5 },
        intenso: { min: 5, max: 6 },
      } as const;
      const paceRange = PACE_CONFIG[pace as keyof typeof PACE_CONFIG] ?? PACE_CONFIG.equilibrado;
      const config =
        typeof maxItemsPerDay === "number" && Number.isFinite(maxItemsPerDay)
          ? {
              pace: {
                itemsPerDayMin: Math.max(1, Math.min(12, Math.round(Math.max(1, maxItemsPerDay - 2)))),
                itemsPerDayMax: Math.max(1, Math.min(12, Math.round(maxItemsPerDay))),
              },
            }
          : {
              pace: {
                itemsPerDayMin: paceRange.min,
                itemsPerDayMax: paceRange.max,
              },
            };

      // Build chunks aligned to cityStays boundaries (max 4 days each).
      // cityStays comes from the same buildRouteStructureFromIntent the server uses,
      // so boundaries match server-side baseCityByDay — one AI call per city segment.
      const chunks: Array<{ offset: number; count: number }> = [];
      if (cityStays.length) {
        let offset = 0;
        for (const stay of cityStays) {
          let remaining = Math.max(1, stay.days);
          while (remaining > 0 && offset < total) {
            const chunkSize = Math.min(4, remaining, total - offset);
            if (chunkSize <= 0) break;
            chunks.push({ offset, count: chunkSize });
            offset += chunkSize;
            remaining -= chunkSize;
          }
        }
        // Fill any tail days not covered by cityStays (safety net)
        while (offset < total) {
          chunks.push({ offset, count: Math.min(4, total - offset) });
          offset += 4;
        }
      } else {
        // Fallback when no cityStays: fixed 4-day chunks
        for (let offset = 0; offset < total; offset += 4) {
          chunks.push({ offset, count: Math.min(4, total - offset) });
        }
      }

      // Snapshot helper — reads dayMap at call time (safe: JS single-threaded between awaits)
      const snapshot = () => Array.from({ length: total }, (_, i) => dayMap.get(i + 1) || placeholderDay(i + 1));

      // Mutable counter updated as chunks resolve (single-threaded: no interleaving at non-await points)
      let completedDays = 0;

      const fetchWithTimeout = async (url: string, init: RequestInit, timeoutMs: number) => {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeoutMs);
        try {
          return await fetch(url, { ...init, signal: controller.signal });
        } finally {
          clearTimeout(id);
        }
      };

      const CHUNK_TIMEOUT_MS = 90_000;
      const CONCURRENCY = 3;

      const runChunk = async ({ offset, count }: { offset: number; count: number }) => {
        let ok = false;
        let lastErr: string | null = null;

        const retryCounts = Array.from(new Set([count, Math.min(2, count), 1])).filter((x) => x >= 1);
        for (const requestedCount of retryCounts) {
          try {
            const res = await fetchWithTimeout(
              "/api/trips/auto-plan/generate-chunk",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ intent, config, dayOffset: offset, dayCount: requestedCount }),
              },
              CHUNK_TIMEOUT_MS
            );
            const { data } = await readJsonResponse<any>(res);
            if (!res.ok) throw new Error(data?.error || "No se pudo generar el itinerario con IA.");

            const days = Array.isArray(data?.days) ? data.days : [];
            const generatedCount =
              typeof data?.dayCount === "number" && Number.isFinite(data.dayCount)
                ? Math.max(1, Math.round(data.dayCount))
                : Math.max(1, days.length || requestedCount);

            const prompts = Array.isArray(data?.prompts) ? data.prompts.map((x: any) => String(x || "")).filter(Boolean) : [];
            if (prompts.length) {
              setAiPromptLog((prev) => [...prev, { dayOffset: offset, dayCount: generatedCount, prompts }]);
            }

            for (const d of days) {
              if (typeof d?.day === "number") dayMap.set(d.day, d);
            }

            completedDays = Math.min(total, completedDays + generatedCount);
            setAiProgress({ done: completedDays, total });
            setItinerary((prev) => ({
              version: 1,
              title: prev?.title || base.title,
              travelMode: prev?.travelMode || base.travelMode,
              days: snapshot(),
            }));

            ok = true;
            break;
          } catch (e) {
            lastErr = e instanceof Error ? e.message : "Timeout / error desconocido";
          }
        }

        if (!ok) {
          dayMap.set(offset + 1, placeholderDay(offset + 1));
          completedDays = Math.min(total, completedDays + 1);
          setAiProgress({ done: completedDays, total });
          toast.error("Un día no se pudo generar", lastErr || "Timeout. Se ha dejado un placeholder para reintentar.");
        }
      };

      for (let i = 0; i < chunks.length; i += CONCURRENCY) {
        const batch = chunks.slice(i, i + CONCURRENCY);
        await Promise.allSettled(batch.map((ch) => runChunk(ch)));
      }

      // Garantía: ningún día puede quedar sin items
      for (let i = 1; i <= total; i++) {
        if (!dayMap.has(i) || !dayMap.get(i)?.items?.length) {
          dayMap.set(i, placeholderDay(i));
        }
      }

      // Final merge after all chunks settle
      setItinerary((prev) => ({
        version: 1,
        title: prev?.title || base.title,
        travelMode: prev?.travelMode || base.travelMode,
        days: snapshot(),
      }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo generar el itinerario con IA.";
      setError(msg);
      toast.error("No se pudo generar con IA", msg);
    } finally {
      setAiGenerating(false);
      setAiProgress(null);
    }
  }

  function downloadText(filename: string, content: string, mime = "text/plain;charset=utf-8") {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function downloadPrompt() {
    if (!aiPromptLog.length) return;
    const payload = {
      generatedAt: new Date().toISOString(),
      destination: destinationLabel,
      startDate,
      endDate,
      intent,
      chunks: aiPromptLog,
    };
    downloadText(`kaviro-prompts-${startDate || "start"}-${endDate || "end"}.json`, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
  }

  function downloadPlan() {
    if (!itinerary) return;
    downloadText(
      `kaviro-plan-${startDate || "start"}-${endDate || "end"}.json`,
      JSON.stringify(itinerary, null, 2),
      "application/json;charset=utf-8"
    );
  }

  async function createTripWithPlan() {
    if (loading) return;
    if (!itinerary) return;
    setLoading(true);
    setCreateStage(0);
    setError(null);
    try {
      setCreateStage(1);
      const list = routeCities.map((x) => x.trim()).filter(Boolean);
      const name = (tripName.trim() || (isoOk(startDate) && isoOk(endDate) ? defaultTripName(list, startDate, endDate) : "")).trim();
      setCreateStage(2);
      const res = await fetch("/api/trips/auto-plan/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trip: {
            name,
            destination: joinTripPlaces(list) || null,
            start_date: isoOk(startDate) ? startDate : null,
            end_date: isoOk(endDate) ? endDate : null,
            base_currency: baseCurrency || "EUR",
          },
          itinerary,
          intent,
        }),
      });
      setCreateStage(3);
      const { data } = await readJsonResponse<any>(res);
      if (!res.ok) throw new Error(data?.error || "No se pudo crear el viaje automáticamente.");
      const tripId = String(data?.tripId || "");
      setCreateStage(4);
      toast.success("Viaje creado", "He creado el viaje y sus planes automáticamente.");
      router.push(`/trip/${encodeURIComponent(tripId)}/plan`);
      router.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo crear el viaje automáticamente.";
      setError(msg);
      toast.error("No se pudo crear el viaje", msg);
    } finally {
      setLoading(false);
      setCreateStage(0);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      {aiGenerating ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-3xl border border-white/10 bg-slate-950/90 p-8 text-white shadow-2xl">
            <div className="flex justify-center">
              <TripBoardLogo variant="light" size="md" withWordmark />
            </div>
            <div className="mt-6 flex items-center justify-center gap-2">
              <span className="h-3 w-3 animate-bounce rounded-full bg-cyan-300 [animation-delay:-0.2s]" />
              <span className="h-3 w-3 animate-bounce rounded-full bg-violet-300 [animation-delay:-0.1s]" />
              <span className="h-3 w-3 animate-bounce rounded-full bg-emerald-300" />
            </div>
            <div className="mt-5 text-center text-lg font-extrabold tracking-tight">Generando tu viaje</div>
            <div className="mt-2 text-center text-sm font-semibold text-slate-300">
              {aiProgress
                ? aiProgress.done === 0
                  ? `Generando ${aiProgress.total} días en paralelo…`
                  : aiProgress.done < aiProgress.total
                    ? `${aiProgress.done}/${aiProgress.total} días completados…`
                    : `${aiProgress.total}/${aiProgress.total} días completados`
                : "Preparando itinerario…"}
            </div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-violet-400 to-emerald-400 transition-all duration-500"
                style={{
                  width: aiProgress?.total ? `${Math.max(6, Math.round((aiProgress.done / aiProgress.total) * 100))}%` : "12%",
                }}
              />
            </div>
            <div className="mt-4 text-center text-xs font-semibold text-slate-400">
              Kaviro está generando un plan coherente día a día y ajustando ciudades, traslados y tiempos.
            </div>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-3xl border border-white/10 bg-slate-950/90 p-8 text-white shadow-2xl">
            <div className="flex justify-center">
              <TripBoardLogo variant="light" size="md" withWordmark />
            </div>
            <div className="mt-6 flex items-center justify-center gap-2">
              <span className="h-3 w-3 animate-bounce rounded-full bg-cyan-300 [animation-delay:-0.2s]" />
              <span className="h-3 w-3 animate-bounce rounded-full bg-violet-300 [animation-delay:-0.1s]" />
              <span className="h-3 w-3 animate-bounce rounded-full bg-emerald-300" />
            </div>
            <div className="mt-5 text-center text-lg font-extrabold tracking-tight">Creando tu viaje</div>
            <div className="mt-2 text-center text-sm font-semibold text-slate-300">
              {createStage <= 1
                ? "Preparando viaje y validando datos…"
                : createStage === 2
                  ? "Guardando viaje y creando planes…"
                  : createStage === 3
                    ? "Finalizando estructura del viaje…"
                    : "Abriendo tu viaje…"}
            </div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-violet-400 to-emerald-400 transition-all duration-500"
                style={{
                  width: `${Math.max(12, Math.min(100, createStage === 0 ? 12 : createStage * 24))}%`,
                }}
              />
            </div>
            <div className="mt-4 text-center text-xs font-semibold text-slate-400">
              Kaviro está creando el viaje y guardando automáticamente todos los planes del itinerario.
            </div>
          </div>
        </div>
      ) : null}

      <div className="mb-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Crear viaje automático</h1>
        <p className="mt-2 text-slate-600">Dime fechas, destinos y estilo. Genero un plan detallado por día y lo guardo como planes del viaje.</p>
      </div>

      {error ? (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          {error}
        </div>
      ) : null}

      <div className="card-soft p-6">
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${step === 1 ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}>
            1 · Básicos
          </span>
          <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${step === 2 ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}>
            2 · Chat
          </span>
          <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${step === 3 ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}>
            3 · Confirmación
          </span>
          <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${step === 4 ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"}`}>
            4 · Plan
          </span>
        </div>

        {step === 1 ? (
          <div className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-extrabold text-slate-900">Destinos (en orden)</label>
                <TripPlacesFields places={routeCities} onChange={setRouteCities} />
                <div className="mt-2 flex items-start gap-2">
                  <input
                    id="forceOrder"
                    type="checkbox"
                    checked={forceOrder}
                    onChange={(e) => setForceOrder(Boolean(e.target.checked))}
                    className="mt-1 h-4 w-4"
                  />
                  <label htmlFor="forceOrder" className="text-sm text-slate-700">
                    Respetar mi orden. Si no, la IA optimizará el mejor recorrido.
                  </label>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-extrabold text-slate-900">Fecha inicio</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    const v = e.target.value;
                    setStartDate(v);
                    if (isoOk(v) && (!endDate || endDate < v)) setEndDate(v);
                  }}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-extrabold text-slate-900">Fecha fin</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate || undefined}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
                />
                <div className="mt-1 text-xs font-semibold text-slate-500">Puede ser el mismo día (viaje de 1 día) o posterior.</div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-extrabold text-slate-900">Nombre del viaje (opcional)</label>
                <input
                  value={tripName}
                  onChange={(e) => setTripName(e.target.value)}
                  placeholder={isoOk(startDate) && isoOk(endDate) ? defaultTripName(routeCities, startDate, endDate) : "Ej. Argentina 2026"}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-extrabold text-slate-900">Moneda base</label>
                <select
                  value={baseCurrency}
                  onChange={(e) => setBaseCurrency(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
                >
                  {currencyOptions.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-2 flex gap-2">
              <button
                type="button"
                disabled={!canStep1 || loading}
                onClick={() => setStep(2)}
                className="btn-primary disabled:opacity-50"
              >
                Continuar
              </button>
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="grid gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-4 py-3">
                <div className="text-sm font-extrabold text-slate-900">Chat</div>
                <div className="mt-0.5 text-xs font-semibold text-slate-600">
                  Responde y el asistente irá rellenando tu viaje. Puedes usar los botones de respuesta rápida.
                </div>
              </div>

              <div className="max-h-[420px] overflow-auto px-4 py-4">
                <div className="space-y-3">
                  {chatMessages.map((m) => (
                    <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                          m.role === "user" ? "bg-slate-900 text-white" : "bg-slate-50 text-slate-900"
                        }`}
                      >
                        <div className="whitespace-pre-wrap">{m.text}</div>
                        {m.role === "assistant" && m.quickReplies?.length ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {m.quickReplies.slice(0, 10).map((qr) => (
                              <button
                                key={qr}
                                type="button"
                                onClick={() => sendChat(qr, { skipAiParse: true })}
                                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-extrabold text-slate-800 hover:bg-slate-50"
                              >
                                {qr}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {aiParsing ? (
                <div className="flex justify-start px-4 pb-1 pt-0">
                  <div className="rounded-2xl bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-400">
                    Analizando tu mensaje…
                  </div>
                </div>
              ) : null}
              <div className="border-t border-slate-100 px-4 py-3">
                <div className="flex gap-2">
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        const v = chatInput;
                        setChatInput("");
                        sendChat(v);
                      }
                    }}
                    placeholder="Escribe tu respuesta…"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-slate-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const v = chatInput;
                      setChatInput("");
                      sendChat(v);
                    }}
                    className="btn-secondary"
                  >
                    Enviar
                  </button>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-extrabold text-slate-900">Visitas propuestas</div>
                <button
                  type="button"
                  onClick={loadSuggestions}
                  disabled={suggestionsLoading || loading || !routeCities.map((x) => x.trim()).filter(Boolean)[0]}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-extrabold text-slate-800 hover:bg-slate-100 disabled:opacity-60"
                >
                  {suggestionsLoading ? "Cargando..." : "Actualizar"}
                </button>
              </div>
              <div className="mt-1 text-xs font-semibold text-slate-600">
                Añade ciudades/regiones como imprescindibles (puedes hacerlo también desde el chat).
              </div>

              {suggestionsError ? (
                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">
                  {suggestionsError}
                </div>
              ) : null}

              <div className="mt-3 max-h-[220px] overflow-auto pr-1">
                <div className="flex flex-wrap gap-2">
                  {(suggestionsLoading ? [] : suggestions).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => addMustSee(s)}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-extrabold text-slate-800 hover:bg-slate-50"
                      title="Añadir como imprescindible"
                    >
                      {s}
                    </button>
                  ))}
                  {!suggestionsLoading && !suggestions.length ? (
                    <div className="text-xs font-semibold text-slate-500">Cargando sugerencias…</div>
                  ) : null}
                </div>
              </div>

              {mustSee.length ? (
                <div className="mt-4">
                  <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Imprescindibles</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {mustSee.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => removeMustSee(m)}
                        className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-extrabold text-slate-800 hover:bg-slate-100"
                        title="Quitar"
                      >
                        {m} ×
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-2 flex gap-2">
              <button type="button" onClick={() => setStep(1)} className="btn-secondary">
                Atrás
              </button>
              <button
                type="button"
                disabled={!canStep2 || loading}
                onClick={async () => {
                  setStep(3);
                  await computeAllocation();
                }}
                className="btn-primary disabled:opacity-50"
              >
                Generar propuesta de ruta
              </button>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="grid gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-extrabold text-slate-900">Confirmación de ruta y noches</div>
              <div className="mt-1 text-xs font-semibold text-slate-600">
                Ajusta noches por destino antes de generar el plan. Esto mejora traslados y evita días "sin sentido".
              </div>

              {allocationError ? (
                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">
                  {allocationError}
                </div>
              ) : null}

              {allocationLoading ? (
                <div className="mt-3 text-xs font-semibold text-slate-600">Calculando reparto…</div>
              ) : (
                <div className="mt-4 grid gap-2">
                  {cityStays.map((s, idx) => (
                    <div key={`${s.city}-${idx}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="text-sm font-extrabold text-slate-900">{s.city}</div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-600">Noches</span>
                        <input
                          inputMode="numeric"
                          value={String(s.days)}
                          onChange={(e) => {
                            const n = Math.max(1, Math.min(30, Math.round(Number(e.target.value || "1"))));
                            setCityStays((prev) => prev.map((x, i) => (i === idx ? { ...x, days: n } : x)));
                          }}
                          className="w-20 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm font-extrabold text-slate-900"
                        />
                      </div>
                    </div>
                  ))}
                  {!cityStays.length ? <div className="text-xs font-semibold text-slate-600">No hay destinos suficientes.</div> : null}
                </div>
              )}

              <div className="mt-4 flex gap-2">
                <button type="button" disabled={loading || allocationLoading} onClick={() => setStep(2)} className="btn-secondary disabled:opacity-50">
                  Volver al chat
                </button>
                <button type="button" disabled={loading || allocationLoading || !canConfirm} onClick={previewPlan} className="btn-primary disabled:opacity-50">
                  Generar itinerario con IA
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-extrabold text-slate-900">Previsualización</div>
                <div className="text-xs font-semibold text-slate-600">
                  {destinationLabel ? destinationLabel : "—"} · {startDate} → {endDate}
                </div>
                {aiProgress ? (
                  <div className="mt-1 text-xs font-semibold text-slate-600">
                    Generando con IA: {aiProgress.done}/{aiProgress.total} días…
                  </div>
                ) : null}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setStep(3)} className="btn-secondary">
                  Ajustar noches
                </button>
                <button
                  type="button"
                  disabled={loading || aiGenerating}
                  onClick={generateAllDaysWithAi}
                  className="btn-secondary disabled:opacity-50"
                  title="Vuelve a generar el itinerario completo con IA en trozos pequeños"
                >
                  {aiGenerating ? "Generando IA..." : "Regenerar con IA"}
                </button>
                <button
                  type="button"
                  disabled={!aiPromptLog.length}
                  onClick={downloadPrompt}
                  className="btn-secondary disabled:opacity-50"
                  title="Descarga los prompts reales enviados a la IA (por chunks)"
                >
                  Descargar prompt
                </button>
                <button
                  type="button"
                  disabled={!itinerary}
                  onClick={downloadPlan}
                  className="btn-secondary disabled:opacity-50"
                  title="Descarga el plan completo en JSON"
                >
                  Descargar plan
                </button>
                <button type="button" disabled={loading || !itinerary} onClick={createTripWithPlan} className="btn-primary disabled:opacity-50">
                  Crear viaje
                </button>
              </div>
            </div>

            {!itinerary ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                {loading ? "Generando..." : 'Pulsa "Generar itinerario con IA" para ver el itinerario.'}
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-4 py-3 text-sm font-extrabold text-slate-900">
                  {itinerary.title || "Itinerario"}
                </div>
                <div className="max-h-[520px] overflow-auto p-4">
                  <div className="space-y-4">
                    {itinerary.days.map((d) => (
                      <div key={String(d.day)} className="rounded-xl border border-slate-200 p-3">
                        <div className="text-sm font-extrabold text-slate-900">
                          Día {d.day} {d.date ? `· ${d.date}` : ""}
                        </div>
                        <div className="mt-2 space-y-2">
                          {(d.items || []).map((it, idx) => (
                            <div key={`${d.day}-${idx}`} className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-slate-900">{it.title}</div>
                                <div className="text-xs text-slate-600">
                                  {(it.place_name || "").trim() ? it.place_name : ""}
                                  {(it.address || "").trim() ? ` · ${it.address}` : ""}
                                </div>
                              </div>
                              <div className="shrink-0 text-xs font-extrabold text-slate-700">{it.start_time ? it.start_time : "—"}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

