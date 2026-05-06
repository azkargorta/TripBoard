
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import PlanActivityCard from "@/components/trip/plan/PlanActivityCard";
import PlanLodgingCard from "@/components/trip/plan/PlanLodgingCard";
import PlanForm, { type PlanFormValues } from "@/components/trip/plan/PlanForm";
import { useTripActivities, type TripActivity } from "@/hooks/useTripActivities";
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Compass,
  Eye,
  EyeOff,
  Filter,
  GripVertical,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import TripPlanCalendar from "@/components/trip/plan/TripPlanCalendar";
import { useTripActivityKinds } from "@/hooks/useTripActivityKinds";
import TripPlanExploreDrawer, { type ExploreCreatePlanPayload } from "@/components/trip/plan/TripPlanExploreDrawer";
import TripPlanNotesPanel from "@/components/trip/plan/TripPlanNotesPanel";
import { SortableRow } from "@/components/trip/plan/SortableRow";
import { activityLikelyNeedsTicket } from "@/lib/trip-plan-ticket-hints";
import {
  btnPrimary,
  btnSecondary,
  chipGroup,
  chipItemActive,
  chipItemBase,
  chipItemInactive,
} from "@/components/ui/brandStyles";

const COMMON_KIND_ICONS: Array<{ emoji: string; label: string }> = [
  { emoji: "📍", label: "Visita" },
  { emoji: "🏛️", label: "Museo" },
  { emoji: "🍽️", label: "Comida" },
  { emoji: "☕", label: "Cafetería" },
  { emoji: "🏖️", label: "Playa" },
  { emoji: "⛰️", label: "Montaña" },
  { emoji: "🥾", label: "Senderismo" },
  { emoji: "🛍️", label: "Compras" },
  { emoji: "🎭", label: "Espectáculo" },
  { emoji: "🎟️", label: "Actividad" },
  { emoji: "🎉", label: "Evento" },
  { emoji: "🌿", label: "Naturaleza" },
  { emoji: "🏟️", label: "Deporte" },
  { emoji: "🍷", label: "Vinos" },
  { emoji: "🍺", label: "Cervezas" },
  { emoji: "🌙", label: "Noche" },
  { emoji: "🏨", label: "Alojamiento" },
  { emoji: "🚆", label: "Transporte" },
  { emoji: "🚗", label: "Coche" },
  { emoji: "✈️", label: "Vuelo" },
  { emoji: "🚌", label: "Bus" },
  { emoji: "⛴️", label: "Ferry" },
  { emoji: "📸", label: "Fotos" },
  { emoji: "🧭", label: "Explorar" },
  { emoji: "🧘", label: "Relax" },
  { emoji: "🧺", label: "Picnic" },
  { emoji: "🧑‍🍳", label: "Cocina" },
];

function groupByDate(activities: TripActivity[]) {
  const groups = new Map<string, TripActivity[]>();

  for (const activity of activities) {
    const key = activity.activity_date || "Sin fecha";
    const prev = groups.get(key) || [];
    prev.push(activity);
    groups.set(key, prev);
  }

  return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
}

function formatPlanDayHeading(dateKey: string): { weekday: string; dayNum: string; month: string; full: string } {
  if (dateKey === "Sin fecha") return { weekday: "", dayNum: "—", month: "Sin fecha", full: "Sin fecha" };
  const d = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(d.getTime())) return { weekday: "", dayNum: "—", month: dateKey, full: dateKey };
  return {
    weekday: new Intl.DateTimeFormat("es-ES", { weekday: "short" }).format(d).replace(".", "").toUpperCase(),
    dayNum: new Intl.DateTimeFormat("es-ES", { day: "numeric" }).format(d),
    month: new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(d),
    full: new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d),
  };
}

function todayYMD() {
  return new Intl.DateTimeFormat("en-CA").format(new Date());
}

function activityCountLabel(n: number) {
  if (n === 1) return "1 actividad";
  return `${n} actividades`;
}

function normalizeKind(kind: unknown) {
  return typeof kind === "string" ? kind.trim().toLowerCase() : "";
}

function toSentenceCase(label: string) {
  const cleaned = String(label || "").trim().replace(/_/g, " ");
  if (!cleaned) return cleaned;
  return cleaned.slice(0, 1).toUpperCase() + cleaned.slice(1).toLowerCase();
}

function defaultKindLabelEs(kindKey: string) {
  const k = normalizeKind(kindKey);
  if (k === "visit") return "Visita";
  if (k === "museum") return "Museo";
  if (k === "restaurant") return "Restaurante";
  if (k === "transport") return "Transporte";
  if (k === "activity") return "Actividad";
  if (k === "lodging") return "Alojamiento";
  return "";
}

function isLodgingActivity(a: TripActivity) {
  return (
    a.activity_type === "lodging" ||
    a.source === "reservation" ||
    Boolean(a.linked_reservation_id) ||
    normalizeKind(a.activity_kind) === "lodging"
  );
}

function canBulkDeletePlanActivity(a: TripActivity) {
  if (a.linked_reservation_id) return false;
  return true;
}

function effectiveKind(a: TripActivity) {
  if (isLodgingActivity(a)) return "lodging";
  return normalizeKind(a.activity_kind) || "visit";
}

function kindMeta(kindRaw: unknown, custom?: Map<string, { label: string; emoji?: string | null; color?: string | null }>) {
  const kind = normalizeKind(kindRaw);
  const fromCustom = custom?.get(kind) || null;
  if (fromCustom) {
    return {
      key: kind,
      label: fromCustom.label || kind,
      glyph: fromCustom.emoji || "•",
      color: fromCustom.color || "#64748b",
    };
  }
  if (kind === "culture") return { key: "culture", label: "Cultura", glyph: "🏛️", color: "#f59e0b" };
  if (kind === "nature") return { key: "nature", label: "Naturaleza", glyph: "🌿", color: "#10b981" };
  if (kind === "viewpoint") return { key: "viewpoint", label: "Mirador", glyph: "🌄", color: "#0ea5e9" };
  if (kind === "neighborhood") return { key: "neighborhood", label: "Barrio", glyph: "🧭", color: "#64748b" };
  if (kind === "market") return { key: "market", label: "Mercado", glyph: "🧺", color: "#f97316" };
  if (kind === "excursion") return { key: "excursion", label: "Excursión", glyph: "🚌", color: "#2563eb" };
  if (kind === "gastro_experience") return { key: "gastro_experience", label: "Gastronomía", glyph: "🍷", color: "#db2777" };
  if (kind === "shopping") return { key: "shopping", label: "Compras", glyph: "🛍️", color: "#a855f7" };
  if (kind === "night") return { key: "night", label: "Noche", glyph: "🌙", color: "#334155" };
  if (kind === "museum") return { key: "museum", label: "Museo", glyph: "M", color: "#f59e0b" };
  if (kind === "restaurant") return { key: "restaurant", label: "Comida", glyph: "🍴", color: "#f97316" };
  if (kind === "transport") return { key: "transport", label: "Transporte", glyph: "✈", color: "#0ea5e9" };
  if (kind === "lodging") return { key: "lodging", label: "Alojamiento", glyph: "H", color: "#8b5cf6" };
  if (kind === "activity") return { key: "activity", label: "Actividad", glyph: "🎟️", color: "#10b981" };
  if (kind === "visit" || !kind) return { key: "visit", label: "Visita", glyph: "📍", color: "#64748b" };
  // Tipo desconocido (todavía sin catálogo): mostrar su propio nombre.
  const label = kind.slice(0, 1).toUpperCase() + kind.slice(1);
  return { key: kind, label, glyph: "🏷️", color: "#475569" };
}

function Chip({
  active,
  onClick,
  label,
  glyph,
  color,
  title,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  glyph: string;
  color: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`inline-flex min-h-[36px] items-center gap-2 rounded-full border px-3 py-2 text-xs font-extrabold transition focus:outline-none focus:ring-2 focus:ring-violet-200 ${
        active ? "border-violet-300 bg-violet-50 text-violet-900" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/70" style={{ backgroundColor: color }}>
        <span className="text-[11px] font-black text-white">{glyph}</span>
      </span>
      <span className="min-w-0 max-w-[min(11rem,78vw)] whitespace-normal break-words text-left leading-tight sm:max-w-[10rem] md:max-w-[160px]">
        {label}
      </span>
    </button>
  );
}

export default function TripPlanView({
  tripId,
  premiumEnabled,
  initialExploreOpen = false,
  initialTripDescription = null,
  canEditTripNotes = false,
  initialWorkspaceTab = "itinerary",
  initialSelectedDate = null,
}: {
  tripId: string;
  premiumEnabled: boolean;
  initialExploreOpen?: boolean;
  initialTripDescription?: string | null;
  canEditTripNotes?: boolean;
  initialWorkspaceTab?: "itinerary" | "notes";
  initialSelectedDate?: string | null;
}) {
  const { trip, activities, loading, saving, error, createActivity, updateActivity, deleteActivity, deleteActivitiesBulk } =
    useTripActivities(tripId);
  const {
    kinds: customKinds,
    loading: customKindsLoading,
    saving: customKindsSaving,
    error: customKindsError,
    warning: customKindsWarning,
    createKind,
    updateKind,
    deleteKind,
  } = useTripActivityKinds(tripId);

  const [editingActivity, setEditingActivity] = useState<TripActivity | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const formAnchorRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<Set<string>>(new Set());
  const [showLodging, setShowLodging] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [selectedDate, setSelectedDate] = useState<string | null>(initialSelectedDate);
  const [kindsOpen, setKindsOpen] = useState(false);
  const [newKind, setNewKind] = useState({ label: "", key: "", emoji: "", color: "#64748b" });
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [editIconPickerId, setEditIconPickerId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [exploreOpen, setExploreOpen] = useState(initialExploreOpen);
  const [workspaceTab, setWorkspaceTab] = useState<"itinerary" | "notes">(initialWorkspaceTab);
  const [bulkDeleteMode, setBulkDeleteMode] = useState(false);
  const [selectedActivityIds, setSelectedActivityIds] = useState<Set<string>>(new Set());
  const [expandedDayKeys, setExpandedDayKeys] = useState<Set<string>>(() => new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [localOrder, setLocalOrder] = useState<Map<string, string[]>>(new Map());
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  useEffect(() => {
    let cancelled = false;
    async function loadHistory() {
      if (!historyOpen) return;
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const resp = await fetch(
          `/api/trip-audit?tripId=${encodeURIComponent(tripId)}&entityType=activity&limit=40`,
          { cache: "no-store" }
        );
        const payload = await resp.json().catch(() => null);
        if (!resp.ok) throw new Error(payload?.error || "No se pudo cargar el historial.");
        if (!cancelled) setHistory(Array.isArray(payload?.logs) ? payload.logs : []);
      } catch (e) {
        if (!cancelled) setHistoryError(e instanceof Error ? e.message : "No se pudo cargar el historial.");
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }
    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [historyOpen, tripId]);

  const availableKinds = useMemo(() => {
    const s = new Set<string>();
    for (const a of activities) {
      const k = effectiveKind(a);
      if (k) s.add(k);
    }
    return Array.from(s.values()).sort();
  }, [activities]);

  const customByKey = useMemo(() => {
    const map = new Map<string, { label: string; emoji?: string | null; color?: string | null }>();
    for (const k of customKinds || []) {
      const key = normalizeKind(k.kind_key);
      if (!key) continue;
      map.set(key, { label: k.label, emoji: k.emoji ?? null, color: k.color ?? null });
    }
    return map;
  }, [customKinds]);

  const kindsForSelect = useMemo(() => {
    // Para el PlanForm: lista de tipos (key/label) desde catálogo + tipos ya usados
    const merged = new Map<string, { key: string; label: string }>();
    for (const k of customKinds || []) {
      const key = normalizeKind(k.kind_key);
      if (!key) continue;
      merged.set(key, { key, label: k.label || key });
    }
    for (const k of availableKinds) {
      const key = normalizeKind(k);
      if (!key) continue;
      if (!merged.has(key)) {
        const base = defaultKindLabelEs(key) || key;
        merged.set(key, { key, label: toSentenceCase(base) });
      }
    }
    return Array.from(merged.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [availableKinds, customKinds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return activities
      .filter((a) => {
        const isLodging = isLodgingActivity(a);
        if (!showLodging && isLodging) return false;
        return true;
      })
      .filter((a) => {
        if (!kindFilter.size) return true;
        const k = effectiveKind(a);
        return kindFilter.has(k);
      })
      .filter((a) => {
        if (!q) return true;
        const hay = `${a.title || ""} ${a.place_name || ""} ${a.address || ""} ${a.description || ""}`.toLowerCase();
        return hay.includes(q);
      });
  }, [activities, kindFilter, query, showLodging]);

  const filteredWithCalendarDate = useMemo(() => {
    if (!selectedDate) return filtered;
    return filtered.filter((a) => (a.activity_date || "") === selectedDate);
  }, [filtered, selectedDate]);

  const grouped = useMemo(() => groupByDate(filteredWithCalendarDate), [filteredWithCalendarDate]);

  const singleDayList = grouped.length === 1;

  const selectableActivityIds = useMemo(
    () => filteredWithCalendarDate.filter(canBulkDeletePlanActivity).map((a) => a.id),
    [filteredWithCalendarDate]
  );
  const lodgingCount = useMemo(
    () => activities.filter((item) => isLodgingActivity(item)).length,
    [activities]
  );

  const ticketHintCount = useMemo(
    () => activities.filter((a) => !isLodgingActivity(a) && activityLikelyNeedsTicket(a)).length,
    [activities]
  );

  const isEditing = Boolean(editingActivity?.id);
  const showForm = isFormOpen || isEditing;

  useEffect(() => {
    if (!showForm) return;
    // Espera un tick para que el formulario esté renderizado
    const id = window.setTimeout(() => {
      formAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
    return () => window.clearTimeout(id);
  }, [showForm]);

  async function handleSubmit(values: PlanFormValues) {
    if (editingActivity?.id) {
      await updateActivity(editingActivity.id, values);
      setEditingActivity(null);
      setIsFormOpen(false);
      return;
    }

    await createActivity(values);
    setIsFormOpen(false);
  }

  function handleStartCreate() {
    setEditingActivity(null);
    setIsFormOpen(true);
  }

  function handleStartEdit(activity: TripActivity) {
    setEditingActivity(activity);
    setIsFormOpen(true);
  }

  function handleCancelEditOrClose() {
    setEditingActivity(null);
    setIsFormOpen(false);
  }

  function openCreateWithExplorePlace(payload: ExploreCreatePlanPayload) {
    setEditingActivity({
      title: payload.title,
      place_name: payload.title,
      address: payload.address,
      latitude: payload.latitude,
      longitude: payload.longitude,
      activity_kind: "visit",
    } as any);
    setIsFormOpen(true);
  }

  function getOrderedItems(date: string, items: TripActivity[]): TripActivity[] {
    const order = localOrder.get(date);
    if (!order) return items;
    const idMap = new Map(items.map((a) => [a.id, a]));
    return [...order.map((id) => idMap.get(id)).filter(Boolean) as TripActivity[], ...items.filter((a) => !order.includes(a.id))];
  }
  function handleDragStart(e: DragStartEvent) { setActiveId(String(e.active.id)); }
  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    setActiveId(null);
    if (!over || active.id === over.id) return;
    for (const [date, items] of grouped) {
      const ordered = getOrderedItems(date, items);
      const oi = ordered.findIndex((a) => a.id === String(active.id));
      const ni = ordered.findIndex((a) => a.id === String(over.id));
      if (oi === -1 || ni === -1) continue;
      setLocalOrder((prev) => new Map(prev).set(date, arrayMove(ordered, oi, ni).map((a) => a.id)));
      break;
    }
  }

  if (loading) {
    return <div className="p-4">Cargando plan...</div>;
  }

  const isEmpty = activities.length === 0;

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div
        role="tablist"
        aria-label="Vista del plan"
        className={`${chipGroup} sm:inline-flex sm:max-w-md`}
      >
        <button
          type="button"
          role="tab"
          aria-selected={workspaceTab === "itinerary"}
          onClick={() => setWorkspaceTab("itinerary")}
          className={`${chipItemBase} sm:flex-1 ${workspaceTab === "itinerary" ? chipItemActive : chipItemInactive}`}
        >
          Itinerario
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={workspaceTab === "notes"}
          onClick={() => setWorkspaceTab("notes")}
          className={`${chipItemBase} sm:flex-1 ${workspaceTab === "notes" ? chipItemActive : chipItemInactive}`}
        >
          Notas
        </button>
      </div>

      {workspaceTab === "notes" ? (
        <TripPlanNotesPanel tripId={tripId} initialDescription={initialTripDescription} readOnly={!canEditTripNotes} />
      ) : null}

      {workspaceTab === "itinerary" && !showForm ? (
        <button
          type="button"
          onClick={handleStartCreate}
          className="fixed bottom-[calc(max(env(safe-area-inset-bottom),8px)+84px)] right-[max(1rem,env(safe-area-inset-right))] z-30 inline-flex h-14 w-14 items-center justify-center rounded-full bg-violet-600 text-white shadow-lg transition hover:bg-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-200 md:hidden"
          aria-label="Añadir plan"
          title="Añadir plan"
        >
          <Plus className="h-6 w-6" aria-hidden />
        </button>
      ) : null}

      {workspaceTab === "itinerary" ? (
        <>
          {premiumEnabled && ticketHintCount > 0 && !isEmpty ? (
            <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 via-white to-amber-50/40 px-4 py-3 text-sm text-amber-950 shadow-sm">
              <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-amber-800">Entradas · Premium</p>
              <p className="mt-1.5 leading-relaxed text-amber-950/95">
                Hay <strong>{ticketHintCount}</strong>{" "}
                {ticketHintCount === 1 ? "actividad marcada" : "actividades marcadas"} como{" "}
                <strong>probables entradas o reservas</strong>. En cada tarjeta usa el botón{" "}
                <span className="font-bold">«Entrada»</span> para abrir una búsqueda orientada a la{" "}
                <strong>web oficial</strong> (verifica siempre la URL y el dominio antes de pagar).
              </p>
            </div>
          ) : null}

          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600">
          <span className="font-semibold text-slate-900">{trip?.name || trip?.destination || "Este viaje"}</span>
          {" · "}
          Añade planes con fecha/hora y reutilízalos en el mapa para rutas.
        </p>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
          {bulkDeleteMode ? (
            <>
              <button
                type="button"
                onClick={() => setSelectedActivityIds(new Set(selectableActivityIds))}
                disabled={!selectableActivityIds.length || saving}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-200 disabled:opacity-50 sm:w-auto"
              >
                Seleccionar todos
              </button>
              <button
                type="button"
                onClick={() => setSelectedActivityIds(new Set())}
                disabled={saving}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 sm:w-auto"
              >
                Quitar selección
              </button>
              <button
                type="button"
                onClick={() => {
                  setBulkDeleteMode(false);
                  setSelectedActivityIds(new Set());
                }}
                disabled={saving}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 sm:w-auto"
              >
                Cancelar
              </button>
            </>
          ) : (
            <></>
          )}
          <button
            type="button"
            onClick={handleStartCreate}
            className={`${btnPrimary} w-full gap-2 sm:w-auto`}
            title="Crear un plan manual"
          >
            <Plus className="h-4 w-4" />
            Añadir plan
          </button>
          <button
            type="button"
            onClick={() => setExploreOpen(true)}
            className={`${btnSecondary} w-full gap-2 sm:w-auto`}
            title="Buscar lugares y crear planes con coordenadas"
          >
            <Compass className="h-4 w-4" />
            Explorar
          </button>
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-200 sm:w-auto"
            title="Ver historial de cambios"
          >
            <Clock className="h-4 w-4" />
            Historial
          </button>
          {bulkDeleteMode ? (
            <button
              type="button"
              disabled={saving || selectedActivityIds.size === 0}
              onClick={() => {
                const ids = [...selectedActivityIds];
                if (!ids.length) return;
                const ok = window.confirm(
                  `¿Eliminar ${ids.length} plan${ids.length === 1 ? "" : "es"} seleccionado${ids.length === 1 ? "" : "s"}? Esta acción no se puede deshacer.`
                );
                if (!ok) return;
                void deleteActivitiesBulk(ids).then(() => {
                  setBulkDeleteMode(false);
                  setSelectedActivityIds(new Set());
                });
              }}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-900 shadow-sm transition hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-200 disabled:opacity-50 sm:w-auto"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              Eliminar{selectedActivityIds.size > 0 ? ` (${selectedActivityIds.size})` : ""}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setBulkDeleteMode(true);
                setSelectedActivityIds(new Set());
              }}
              disabled={!filteredWithCalendarDate.length}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-5 py-3 text-sm font-semibold text-rose-900 shadow-sm transition hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-200 disabled:opacity-50 sm:w-auto"
              title="Eliminar varios planes a la vez"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              Eliminar
            </button>
          )}
        </div>
      </div>

      <TripPlanExploreDrawer
        tripId={tripId}
        open={exploreOpen}
        onClose={() => setExploreOpen(false)}
        onCreatePlan={openCreateWithExplorePlace}
      />

      {historyOpen ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-950">Historial de cambios (Plan)</div>
              <div className="mt-1 text-xs text-slate-600">Quién creó/editó/eliminó planes recientemente.</div>
            </div>
            <button
              type="button"
              onClick={() => setHistoryOpen(false)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cerrar
            </button>
          </div>

          {historyLoading ? (
            <div className="mt-4 text-sm text-slate-600">Cargando historial…</div>
          ) : historyError ? (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {historyError}
            </div>
          ) : history.length ? (
            <div className="mt-4 space-y-2">
              {history.map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-950">
                        {item.summary || `${item.action} ${item.entity_type}`}
                      </div>
                      <div className="mt-1 text-xs text-slate-600">
                        {(item.actor_email || "Alguien")} · {new Date(item.created_at).toLocaleString("es-ES")}
                      </div>
                    </div>
                    <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                      {item.action}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 text-sm text-slate-600">Todavía no hay cambios registrados.</div>
          )}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 md:gap-4">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 shadow-sm md:p-4">
          <p className="text-[11px] font-semibold leading-tight text-slate-500 md:text-sm">Actividades totales</p>
          <p className="mt-0.5 text-2xl font-bold leading-none text-slate-950 md:mt-2 md:text-3xl">{activities.length}</p>
        </div>
        <div className="rounded-2xl border border-violet-200 bg-violet-50 px-3 py-2 shadow-sm md:p-4">
          <p className="text-[11px] font-semibold leading-tight text-violet-800 md:text-sm">Alojamientos</p>
          <p className="mt-0.5 text-2xl font-bold leading-none text-violet-950 md:mt-2 md:text-3xl">{lodgingCount}</p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-extrabold text-slate-900 shadow-sm transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-200 sm:w-auto sm:justify-start"
          >
            <SlidersHorizontal className="h-4 w-4 shrink-0 text-slate-700" aria-hidden />
            Filtros
            {filtersOpen ? (
              <ChevronUp className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
            ) : (
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
            )}
          </button>

          <div className="inline-flex w-full overflow-hidden rounded-xl border border-slate-200 bg-white sm:w-auto">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 px-3 text-xs font-extrabold transition sm:min-h-[36px] sm:flex-none ${
                viewMode === "list"
                  ? "bg-violet-600 text-white hover:bg-violet-700"
                  : "text-slate-700 hover:bg-violet-50"
              }`}
              title="Vista de lista"
            >
              Lista
            </button>
            <button
              type="button"
              onClick={() => setViewMode("calendar")}
              className={`inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 px-3 text-xs font-extrabold transition sm:min-h-[36px] sm:flex-none ${
                viewMode === "calendar"
                  ? "bg-violet-600 text-white hover:bg-violet-700"
                  : "text-slate-700 hover:bg-violet-50"
              }`}
              title="Vista calendario"
            >
              Calendario
            </button>
          </div>
        </div>

        {filtersOpen ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-extrabold text-slate-950">
                <SlidersHorizontal className="h-4 w-4 text-slate-700" aria-hidden />
                Vista y alojamientos
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setShowLodging((v) => !v)}
                  className={`inline-flex min-h-[36px] items-center gap-2 rounded-xl border px-3 text-xs font-extrabold transition focus:outline-none focus:ring-2 focus:ring-violet-200 ${
                    showLodging ? "border-violet-200 bg-violet-50 text-violet-950" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                  title="Mostrar/ocultar alojamientos"
                >
                  {showLodging ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  Alojamiento
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por título, lugar o dirección…"
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 text-sm font-semibold text-slate-900 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-2 text-xs font-extrabold text-slate-700">
                  <Filter className="h-4 w-4" />
                  Tipos:
                </div>

                <button
                  type="button"
                  onClick={() => setKindFilter(new Set())}
                  className={`inline-flex min-h-[36px] items-center gap-2 rounded-full border px-3 py-2 text-xs font-extrabold transition focus:outline-none focus:ring-2 focus:ring-violet-200 ${
                    kindFilter.size === 0 ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                  title="Todos los tipos"
                >
                  <CalendarDays className="h-4 w-4" />
                  Todos
                </button>

                {availableKinds.map((k) => {
                  const active = kindFilter.has(k);
                  const meta = kindMeta(k, customByKey);
                  return (
                    <Chip
                      key={k}
                      active={active}
                      onClick={() => {
                        setKindFilter((prev) => {
                          if (prev.has(k) && prev.size === 1) return new Set();
                          return new Set([k]);
                        });
                      }}
                      label={meta.label}
                      glyph={meta.glyph}
                      color={meta.color}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <details className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-extrabold text-slate-950">Tipos personalizados</div>
            <div className="mt-1 text-xs text-slate-600">
              Avanzado: crea categorías reutilizables (emoji/color) para Plan y Rutas.
            </div>
          </div>
          <span className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            <span className="group-open:hidden">Abrir</span>
            <span className="hidden group-open:inline">Cerrar</span>
            <span className="text-slate-400" aria-hidden>
              <span className="group-open:hidden">▾</span>
              <span className="hidden group-open:inline">▴</span>
            </span>
          </span>
        </summary>

        <div className="mt-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="text-xs font-semibold text-slate-600">
              Aquí puedes crear, editar o eliminar tipos. Los verás en filtros, chinchetas y formularios.
            </div>
            <button
              type="button"
              onClick={() => setKindsOpen((v) => !v)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              {kindsOpen ? "Cerrar" : "Gestionar"}
            </button>
          </div>

          {customKindsWarning ? (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {customKindsWarning}
            </div>
          ) : null}
          {customKindsError ? (
            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {customKindsError}
            </div>
          ) : null}

          {kindsOpen ? (
            <div className="mt-4 grid gap-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-600">Nuevo tipo</div>
              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-semibold text-slate-700">Nombre</span>
                  <input
                    value={newKind.label}
                    onChange={(e) =>
                      setNewKind((s) => ({
                        ...s,
                        label: e.target.value,
                        key: s.key || normalizeKind(e.target.value).replace(/\s+/g, "_"),
                      }))
                    }
                    className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900"
                    placeholder="Ej. Playa"
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-slate-700">Emoji</span>
                  <div className="flex gap-2">
                    <input
                      value={newKind.emoji}
                      onChange={(e) => setNewKind((s) => ({ ...s, emoji: e.target.value }))}
                      className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900"
                      placeholder="🏖️"
                      title="Puedes escribir un emoji o elegir uno de la lista"
                    />
                    <button
                      type="button"
                      onClick={() => setIconPickerOpen((v) => !v)}
                      className="inline-flex min-h-[42px] shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-700 hover:bg-slate-50"
                      title="Elegir icono"
                    >
                      {iconPickerOpen ? "Cerrar" : "Iconos"}
                    </button>
                  </div>
                  {iconPickerOpen ? (
                    <div className="mt-2 grid grid-cols-7 gap-2 rounded-2xl border border-slate-200 bg-white p-3">
                      {COMMON_KIND_ICONS.map((item) => (
                        <button
                          key={item.emoji}
                          type="button"
                          onClick={() => {
                            setNewKind((s) => ({ ...s, emoji: item.emoji }));
                            setIconPickerOpen(false);
                          }}
                          className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border text-2xl leading-none transition hover:bg-slate-50 ${
                            newKind.emoji === item.emoji ? "border-violet-300 bg-violet-50" : "border-slate-200 bg-white"
                          }`}
                          title={item.label}
                        >
                          {item.emoji}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-slate-700">Color</span>
                  <input
                    type="color"
                    value={newKind.color || "#64748b"}
                    onChange={(e) => setNewKind((s) => ({ ...s, color: e.target.value }))}
                    className="min-h-[42px] w-full rounded-xl border border-slate-300 bg-white px-2"
                    aria-label="Color del tipo"
                  />
                </label>
              </div>
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  disabled={customKindsSaving || !newKind.label.trim()}
                  onClick={() =>
                    void createKind({
                      kind_key: newKind.key || newKind.label,
                      label: newKind.label,
                      emoji: newKind.emoji.trim() || null,
                      color: newKind.color || null,
                    }).then(() => setNewKind({ label: "", key: "", emoji: "", color: "#64748b" }))
                  }
                  className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-xs font-extrabold text-white disabled:opacity-60"
                >
                  {customKindsSaving ? "Guardando…" : "Crear tipo"}
                </button>
              </div>
            </div>

            <div className="grid gap-3">
              <div className="text-xs font-extrabold uppercase tracking-[0.12em] text-slate-600">Tipos existentes</div>
              {customKindsLoading ? (
                <div className="text-sm text-slate-600">Cargando tipos…</div>
              ) : customKinds.length ? (
                customKinds.map((k) => (
                  <div key={k.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-slate-950">
                          {(k.emoji ? `${k.emoji} ` : "") + k.label}
                        </div>
                        <div className="mt-1 text-xs text-slate-600">Clave: {k.kind_key}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={k.color || "#64748b"}
                          onChange={(e) => void updateKind(k.id, { color: e.target.value })}
                          className="h-10 w-12 cursor-pointer rounded-xl border border-slate-200 bg-white px-2"
                          title="Cambiar color"
                          aria-label="Cambiar color"
                          disabled={customKindsSaving}
                        />
                        <input
                          value={k.emoji || ""}
                          onChange={(e) => void updateKind(k.id, { emoji: e.target.value.trim() || null })}
                          className="h-10 w-14 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold"
                          placeholder="😀"
                          title="Emoji"
                          disabled={customKindsSaving}
                        />
                        <button
                          type="button"
                          onClick={() => setEditIconPickerId((prev) => (prev === k.id ? null : k.id))}
                          className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                          disabled={customKindsSaving}
                          title="Elegir icono"
                        >
                          Iconos
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteKind(k.id)}
                          className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-3 text-xs font-extrabold text-rose-800 hover:bg-rose-100 disabled:opacity-60"
                          disabled={customKindsSaving}
                          title="Eliminar tipo"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                    {editIconPickerId === k.id ? (
                      <div className="mt-3 grid grid-cols-10 gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                        {COMMON_KIND_ICONS.map((item) => (
                          <button
                            key={item.emoji}
                            type="button"
                            onClick={() => {
                              void updateKind(k.id, { emoji: item.emoji });
                              setEditIconPickerId(null);
                            }}
                            className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border text-2xl leading-none transition hover:bg-white ${
                              (k.emoji || "") === item.emoji ? "border-violet-300 bg-violet-50" : "border-slate-200 bg-white"
                            }`}
                            title={item.label}
                            disabled={customKindsSaving}
                          >
                            {item.emoji}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-600">
                  Todavía no has creado tipos personalizados.
                </div>
              )}
            </div>
          </div>
          ) : null}
        </div>
      </details>

      {showForm ? (
        <div ref={formAnchorRef} className="scroll-mt-24">
          <PlanForm
          saving={saving}
          initialData={editingActivity}
          onCancelEdit={handleCancelEditOrClose}
          onSubmit={handleSubmit}
          premiumEnabled={premiumEnabled}
          availableKinds={kindsForSelect}
          />
        </div>
      ) : null}

      {viewMode === "calendar" ? (
        <TripPlanCalendar
          activities={filtered}
          selectedDate={selectedDate}
          onSelectDate={(d) => {
            setSelectedDate(d);
          }}
        />
      ) : null}

      {grouped.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          {selectedDate ? (
            // Filtered day — no results
            <div className="px-6 py-8 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-2xl">📭</div>
              <p className="text-base font-extrabold text-slate-900">Sin actividades este día</p>
              <p className="mt-1 text-sm text-slate-500">Prueba otra fecha o quita los filtros activos.</p>
            </div>
          ) : isEmpty ? (
            // P7 — Empty state rediseñado
            <div className="px-6 py-10 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-violet-100 to-indigo-100 text-3xl shadow-sm">
                🗺️
              </div>
              <p className="text-lg font-extrabold text-slate-900">Empieza a planificar</p>
              <p className="mx-auto mt-1.5 max-w-xs text-sm text-slate-500 leading-relaxed">
                Añade actividades manualmente, explora lugares en el mapa, o genera el plan completo con la IA.
              </p>
              <div className="mt-6 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
                <button
                  type="button"
                  onClick={handleStartCreate}
                  className="inline-flex min-h-11 w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-200"
                >
                  <Plus className="h-4 w-4" />
                  Añadir actividad
                </button>
                <button
                  type="button"
                  onClick={() => setExploreOpen(true)}
                  className="inline-flex min-h-11 w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-5 py-2.5 text-sm font-semibold text-violet-900 shadow-sm transition hover:bg-violet-100 focus:outline-none focus:ring-2 focus:ring-violet-200"
                >
                  <Compass className="h-4 w-4" />
                  Explorar lugares
                </button>
              </div>
            </div>
          ) : (
            <div className="px-6 py-8 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-2xl">🔍</div>
              <p className="text-base font-extrabold text-slate-900">Sin resultados</p>
              <p className="mt-1 text-sm text-slate-500">Prueba a quitar filtros o cambiar la búsqueda.</p>
            </div>
          )}
        </div>
      ) : null}

      <div className="space-y-3">
        {grouped.map(([date, items]) => {
          const expanded = singleDayList || expandedDayKeys.has(date);
          const heading = formatPlanDayHeading(date);
          const today = todayYMD();
          return (
            <section key={date} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
              {/* P1 — Cabecera de día rediseñada */}
              <button
                type="button"
                disabled={singleDayList}
                onClick={() => {
                  if (singleDayList) return;
                  setExpandedDayKeys((prev) => {
                    const next = new Set(prev);
                    if (next.has(date)) next.delete(date);
                    else next.add(date);
                    return next;
                  });
                }}
                className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition ${
                  singleDayList ? "cursor-default" : "cursor-pointer hover:bg-slate-50/80 active:bg-slate-100/60"
                }`}
                aria-expanded={expanded}
              >
                {/* Date badge — day number + weekday */}
                <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400 leading-none">
                    {heading.weekday}
                  </span>
                  <span className="text-lg font-extrabold leading-tight text-slate-900 tabular-nums">
                    {heading.dayNum}
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="text-sm font-extrabold text-slate-950 leading-snug capitalize">{heading.month}</div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                      {activityCountLabel(items.length)}
                    </span>
                    {date === today && (
                      <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">
                        Hoy
                      </span>
                    )}
                  </div>
                </div>

                {singleDayList ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-slate-300" aria-hidden />
                ) : expanded ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                )}
              </button>

              {expanded ? (
                <div className="border-t border-slate-100 px-4 pb-4 pt-3">
                  {/* P2 — Timeline vertical continua */}
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                    <SortableContext items={getOrderedItems(date, items).map((a) => a.id)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-2">
                        {getOrderedItems(date, items).map((activity) => {
                          const isLodging = isLodgingActivity(activity);
                          const meta = kindMeta(isLodging ? "lodging" : activity.activity_kind, customByKey);
                          return (
                            <SortableRow key={activity.id} id={activity.id} color={meta.color}>
                              {isLodging ? (
                                <PlanLodgingCard activity={activity} onEdit={handleStartEdit} onDelete={(item) => deleteActivity(item.id)} selectable={bulkDeleteMode && canBulkDeletePlanActivity(activity)} selected={selectedActivityIds.has(activity.id)} onToggleSelect={() => setSelectedActivityIds((prev) => { const n = new Set(prev); if (n.has(activity.id)) n.delete(activity.id); else n.add(activity.id); return n; })} />
                              ) : (
                                <PlanActivityCard activity={activity} onEdit={handleStartEdit} onDelete={(item) => deleteActivity(item.id)} selectable={bulkDeleteMode && canBulkDeletePlanActivity(activity)} selected={selectedActivityIds.has(activity.id)} onToggleSelect={() => setSelectedActivityIds((prev) => { const n = new Set(prev); if (n.has(activity.id)) n.delete(activity.id); else n.add(activity.id); return n; })} premiumEnabled={premiumEnabled} />
                              )}
                            </SortableRow>
                          );
                        })}
                      </div>
                    </SortableContext>
                  </DndContext>
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
        </>
      ) : null}
    </div>
  );
}
