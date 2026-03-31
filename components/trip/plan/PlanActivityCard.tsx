"use client";

type PlanActivity = {
  trip_id?: string;
  id: string;
  title: string;
  description?: string | null;
  activity_date?: string | null;
  activity_time?: string | null;
  place_name?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  activity_type?: string | null;
  activity_kind?: string | null;
  source?: string | null;
};

type Props = {
  activity: PlanActivity;
  onEdit?: (activity: PlanActivity) => void;
  onDelete?: (activity: PlanActivity) => void;
};

function getActivityMeta(kind?: string | null) {
  switch (kind) {
    case "museum":
      return { icon: "🏛️", label: "Museo", badge: "bg-amber-100 text-amber-700" };
    case "restaurant":
      return { icon: "🍽️", label: "Restaurante", badge: "bg-rose-100 text-rose-700" };
    case "transport":
      return { icon: "🚆", label: "Transporte", badge: "bg-sky-100 text-sky-700" };
    case "lodging":
      return { icon: "🏨", label: "Alojamiento", badge: "bg-violet-100 text-violet-700" };
    case "activity":
      return { icon: "🎟️", label: "Actividad", badge: "bg-emerald-100 text-emerald-700" };
    case "visit":
    default:
      return { icon: "📍", label: "Visita", badge: "bg-slate-100 text-slate-700" };
    }
}

function buildGoogleMapsUrl(activity: PlanActivity) {
  if (typeof activity.latitude === "number" && typeof activity.longitude === "number") {
    return `https://www.google.com/maps/search/?api=1&query=${activity.latitude},${activity.longitude}`;
  }
  const query = activity.address || activity.place_name || activity.title;
  if (!query) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export default function PlanActivityCard({ activity, onEdit, onDelete }: Props) {
  const meta = getActivityMeta(activity.activity_kind);
  const googleMapsUrl = buildGoogleMapsUrl(activity);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${meta.badge}`}>
            <span>{meta.icon}</span>
            <span>{meta.label}</span>
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
            {activity.address ? <p className="line-clamp-2">{activity.address}</p> : null}
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {googleMapsUrl ? (
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700"
          >
            Ir a Google Maps
          </a>
        ) : null}
        {onEdit ? (
          <button
            type="button"
            onClick={() => onEdit(activity)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900"
          >
            Editar
          </button>
        ) : null}
        {onDelete ? (
          <button
            type="button"
            onClick={() => onDelete(activity)}
            className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700"
          >
            Borrar
          </button>
        ) : null}
      </div>
    </div>
  );
}
