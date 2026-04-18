"use client";

import { Check, Star } from "lucide-react";
import PlanCardActions from "@/components/trip/plan/PlanCardActions";

type PlanLodging = {
  id: string;
  title: string;
  description?: string | null;
  rating?: number | null;
  comment?: string | null;
  activity_date?: string | null;
  activity_time?: string | null;
  place_name?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

type Props = {
  activity: PlanLodging;
  onEdit?: (activity: PlanLodging) => void;
  onDelete?: (activity: PlanLodging) => void;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
};

function buildGoogleMapsUrl(activity: PlanLodging) {
  if (typeof activity.latitude === "number" && typeof activity.longitude === "number") {
    return `https://www.google.com/maps/search/?api=1&query=${activity.latitude},${activity.longitude}`;
  }

  const query = activity.address || activity.place_name || activity.title;
  if (!query) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export default function PlanLodgingCard({
  activity,
  onEdit,
  onDelete,
  selectable,
  selected,
  onToggleSelect,
}: Props) {
  const googleMapsUrl = buildGoogleMapsUrl(activity);
  const rating = typeof activity.rating === "number" ? Math.max(1, Math.min(5, Math.round(activity.rating))) : null;

  return (
    <div
      className={`relative rounded-2xl border border-violet-200 bg-violet-50 p-4 shadow-sm ${selectable ? "cursor-pointer ring-offset-2 transition hover:ring-2 hover:ring-violet-400/80" : ""} ${selected ? "ring-2 ring-violet-600" : ""}`}
      onClick={selectable && onToggleSelect ? () => onToggleSelect() : undefined}
      onKeyDown={
        selectable && onToggleSelect
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onToggleSelect();
              }
            }
          : undefined
      }
      role={selectable ? "button" : undefined}
      tabIndex={selectable ? 0 : undefined}
    >
      {selectable ? (
        <button
          type="button"
          className={`absolute left-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full border-2 shadow-sm ${
            selected ? "border-violet-600 bg-violet-600 text-white" : "border-slate-300 bg-white text-transparent"
          }`}
          aria-label={selected ? "Quitar selección" : "Seleccionar"}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect?.();
          }}
        >
          <Check className="h-4 w-4 stroke-[3]" />
        </button>
      ) : null}
      <PlanCardActions
        placement="topRight"
        googleMapsUrl={googleMapsUrl}
        onEdit={onEdit}
        onDelete={onDelete}
        item={activity}
        accent="violet"
        disableEdit={!onEdit}
        disableDelete={!onDelete}
        disabledReason="Sincronizado desde Reservas"
        stopPropagation={Boolean(selectable)}
      />
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
            <span>🏨</span>
            <span>Alojamiento</span>
          </div>

          <h4 className="mt-3 text-base font-semibold text-slate-900">{activity.title}</h4>

          <div className="mt-2 space-y-1 text-sm text-slate-700">
            {activity.activity_date || activity.activity_time ? (
              <p>
                {activity.activity_date || "Sin fecha"}
                {activity.activity_time ? ` · ${activity.activity_time}` : ""}
              </p>
            ) : null}
            {activity.place_name ? <p>{activity.place_name}</p> : null}
            {activity.address ? <p>{activity.address}</p> : null}
            {activity.description ? <p className="text-slate-600">{activity.description}</p> : null}
            {rating ? (
              <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-amber-200/70 bg-white/70 px-3 py-1 text-xs font-semibold text-amber-800">
                <div className="flex items-center gap-1" aria-label={`${rating} de 5`}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`h-4 w-4 ${i < rating ? "fill-current text-amber-500" : "text-amber-200"}`}
                      aria-hidden
                    />
                  ))}
                </div>
                <span className="text-amber-900/70">{rating}/5</span>
              </div>
            ) : null}
            {activity.comment ? (
              <p className="mt-2 rounded-xl border border-violet-200 bg-white/70 px-3 py-2 text-sm text-slate-700">
                {activity.comment}
              </p>
            ) : null}
            {typeof activity.latitude === "number" && typeof activity.longitude === "number" ? (
              <p className="text-xs text-violet-700">
                {activity.latitude.toFixed(6)}, {activity.longitude.toFixed(6)}
              </p>
            ) : null}
          </div>
        </div>

      </div>

    </div>
  );
}
