
"use client";

import { useMemo, useState } from "react";
import PlanActivityCard from "@/components/trip/plan/PlanActivityCard";
import PlanLodgingCard from "@/components/trip/plan/PlanLodgingCard";
import PlanForm, { type PlanFormValues } from "@/components/trip/plan/PlanForm";
import { useTripActivities, type TripActivity } from "@/hooks/useTripActivities";

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

export default function TripPlanView({ tripId }: { tripId: string }) {
  const { trip, activities, loading, saving, error, createActivity, updateActivity, deleteActivity } =
    useTripActivities(tripId);

  const [editingActivity, setEditingActivity] = useState<TripActivity | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const grouped = useMemo(() => groupByDate(activities), [activities]);
  const lodgingCount = useMemo(
    () => activities.filter((item) => item.activity_type === "lodging" || item.source === "reservation").length,
    [activities]
  );
  const manualCount = useMemo(
    () => activities.filter((item) => item.source !== "reservation").length,
    [activities]
  );

  const isEditing = Boolean(editingActivity?.id);
  const showForm = isFormOpen || isEditing;

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

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
          <span>🗓️</span>
          <span>Plan del viaje</span>
        </div>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold text-slate-950">
              {trip?.name || trip?.destination || "Plan del viaje"}
            </h2>

            <p className="mt-2 text-sm text-slate-600 max-w-3xl">
              Mantiene las actividades manuales y añade automáticamente los alojamientos sincronizados desde Reservas.
            </p>
          </div>

          <button
            type="button"
            onClick={handleStartCreate}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm"
          >
            Añadir plan
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm text-slate-500">Actividades totales</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{activities.length}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm text-slate-500">Planes manuales</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{manualCount}</p>
          </div>
          <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
            <p className="text-sm text-violet-600">Alojamientos</p>
            <p className="mt-2 text-3xl font-bold text-violet-900">{lodgingCount}</p>
          </div>
        </div>
      </div>

      {showForm ? (
        <PlanForm
          saving={saving}
          initialData={editingActivity}
          onCancelEdit={handleCancelEditOrClose}
          onSubmit={handleSubmit}
        />
      ) : null}

      {grouped.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
          Todavía no hay actividades en el plan.
        </div>
      ) : null}

      <div className="space-y-6">
        {grouped.map(([date, items]) => (
          <section key={date} className="space-y-3">
            <div className="inline-flex rounded-full bg-slate-900 px-3 py-1 text-sm font-semibold text-white">
              {date}
            </div>

            <div className="grid gap-4">
              {items.map((activity) =>
                activity.activity_type === "lodging" || activity.source === "reservation" ? (
                  <PlanLodgingCard key={activity.id} activity={activity} />
                ) : (
                  <PlanActivityCard
                    key={activity.id}
                    activity={activity}
                    onEdit={handleStartEdit}
                    onDelete={(item) => deleteActivity(item.id)}
                  />
                )
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
