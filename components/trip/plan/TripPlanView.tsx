
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import PlanActivityCard from "@/components/trip/plan/PlanActivityCard";
import PlanLodgingCard from "@/components/trip/plan/PlanLodgingCard";
import PlanForm, { type PlanFormValues } from "@/components/trip/plan/PlanForm";
import { useTripActivities, type TripActivity } from "@/hooks/useTripActivities";
import { CalendarDays, Eye, EyeOff, Filter, Plus, Search, SlidersHorizontal } from "lucide-react";

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

function normalizeKind(kind: unknown) {
  return typeof kind === "string" ? kind.trim().toLowerCase() : "";
}

function isLodgingActivity(a: TripActivity) {
  return (
    a.activity_type === "lodging" ||
    a.source === "reservation" ||
    Boolean(a.linked_reservation_id) ||
    normalizeKind(a.activity_kind) === "lodging"
  );
}

function effectiveKind(a: TripActivity) {
  if (isLodgingActivity(a)) return "lodging";
  return normalizeKind(a.activity_kind) || "visit";
}

function kindMeta(kindRaw: unknown) {
  const kind = normalizeKind(kindRaw);
  if (kind === "museum") return { key: "museum", label: "Museo", glyph: "M", color: "#f59e0b" };
  if (kind === "restaurant") return { key: "restaurant", label: "Comida", glyph: "🍴", color: "#f97316" };
  if (kind === "transport") return { key: "transport", label: "Transporte", glyph: "✈", color: "#0ea5e9" };
  if (kind === "lodging") return { key: "lodging", label: "Alojamiento", glyph: "H", color: "#8b5cf6" };
  if (kind === "activity") return { key: "activity", label: "Actividad", glyph: "🎟️", color: "#10b981" };
  return { key: "visit", label: "Visita", glyph: "📍", color: "#64748b" };
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
      <span className="max-w-[160px] truncate">{label}</span>
    </button>
  );
}

export default function TripPlanView({ tripId }: { tripId: string }) {
  const { trip, activities, loading, saving, error, createActivity, updateActivity, deleteActivity } =
    useTripActivities(tripId);

  const [editingActivity, setEditingActivity] = useState<TripActivity | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const formAnchorRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<Set<string>>(new Set());
  const [showLodging, setShowLodging] = useState(true);
  const [showManual, setShowManual] = useState(true);

  const availableKinds = useMemo(() => {
    const s = new Set<string>();
    for (const a of activities) {
      const k = effectiveKind(a);
      if (k) s.add(k);
    }
    return Array.from(s.values()).sort();
  }, [activities]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return activities
      .filter((a) => {
        const isLodging = isLodgingActivity(a);
        if (!showLodging && isLodging) return false;
        if (!showManual && !isLodging) return false;
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
  }, [activities, kindFilter, query, showLodging, showManual]);

  const grouped = useMemo(() => groupByDate(filtered), [filtered]);
  const lodgingCount = useMemo(
    () => activities.filter((item) => isLodgingActivity(item)).length,
    [activities]
  );
  const manualCount = useMemo(
    () => activities.filter((item) => !isLodgingActivity(item)).length,
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
    if (editingActivity) {
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

  if (loading) {
    return <div className="p-4">Cargando plan...</div>;
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600">
          <span className="font-semibold text-slate-900">{trip?.name || trip?.destination || "Este viaje"}</span>
          {" · "}
          Actividades manuales y alojamientos sincronizados desde Reservas.
        </p>
        <button
          type="button"
          onClick={handleStartCreate}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-violet-200 sm:w-auto"
        >
          <Plus className="h-4 w-4" />
          Añadir plan
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <p className="text-sm text-slate-500">Actividades totales</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{activities.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <p className="text-sm text-slate-500">Planes manuales</p>
          <p className="mt-2 text-3xl font-bold text-slate-950">{manualCount}</p>
        </div>
        <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 shadow-sm">
          <p className="text-sm text-violet-600">Alojamientos</p>
          <p className="mt-2 text-3xl font-bold text-violet-900">{lodgingCount}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-extrabold text-slate-950">
            <SlidersHorizontal className="h-4 w-4 text-slate-700" />
            Filtros
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowManual((v) => !v)}
              className={`inline-flex min-h-[36px] items-center gap-2 rounded-xl border px-3 text-xs font-extrabold transition focus:outline-none focus:ring-2 focus:ring-violet-200 ${
                showManual ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
              title="Mostrar/ocultar planes manuales"
            >
              {showManual ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              Manual
            </button>
            <button
              type="button"
              onClick={() => setShowLodging((v) => !v)}
              className={`inline-flex min-h-[36px] items-center gap-2 rounded-xl border px-3 text-xs font-extrabold transition focus:outline-none focus:ring-2 focus:ring-violet-200 ${
                showLodging ? "border-violet-200 bg-violet-50 text-violet-900" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
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
              const meta = kindMeta(k);
              return (
                <Chip
                  key={k}
                  active={active}
                  onClick={() =>
                    setKindFilter((prev) => {
                      const next = new Set(prev);
                      if (next.has(k)) next.delete(k);
                      else next.add(k);
                      return next;
                    })
                  }
                  label={meta.label}
                  glyph={meta.glyph}
                  color={meta.color}
                />
              );
            })}
          </div>
        </div>
      </div>

      {showForm ? (
        <div ref={formAnchorRef} className="scroll-mt-24">
          <PlanForm
          saving={saving}
          initialData={editingActivity}
          onCancelEdit={handleCancelEditOrClose}
          onSubmit={handleSubmit}
          />
        </div>
      ) : null}

      {grouped.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
          Todavía no hay actividades en el plan.
        </div>
      ) : null}

      <div className="space-y-6">
        {grouped.map(([date, items]) => (
          <section key={date} className="space-y-3">
            <div className="flex items-center gap-3 px-1">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700">
                <CalendarDays className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <div className="text-xs font-extrabold text-slate-900">{date}</div>
                <div className="text-[11px] text-slate-500">{items.length} items</div>
              </div>
              <div className="h-px flex-1 bg-slate-200" />
            </div>

            <div className="space-y-3 border-l border-slate-200 pl-4">
              {items.map((activity) => {
                const isLodging = isLodgingActivity(activity);
                const meta = kindMeta(isLodging ? "lodging" : activity.activity_kind);
                return (
                  <div key={activity.id} className="relative">
                    <span
                      className="absolute -left-[21px] top-6 h-3 w-3 rounded-full border border-white"
                      style={{ backgroundColor: meta.color }}
                      aria-hidden="true"
                    />
                    {isLodging ? (
                      <PlanLodgingCard activity={activity} />
                    ) : (
                      <PlanActivityCard
                        activity={activity}
                        onEdit={handleStartEdit}
                        onDelete={(item) => deleteActivity(item.id)}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
