"use client";

type PlanLodging = {
  id: string;
  title: string;
  description?: string | null;
  activity_date?: string | null;
  activity_time?: string | null;
  place_name?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

type Props = {
  activity: PlanLodging;
};

function buildGoogleMapsUrl(activity: PlanLodging) {
  if (typeof activity.latitude === "number" && typeof activity.longitude === "number") {
    return `https://www.google.com/maps/search/?api=1&query=${activity.latitude},${activity.longitude}`;
  }

  const query = activity.address || activity.place_name || activity.title;
  if (!query) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export default function PlanLodgingCard({ activity }: Props) {
  const googleMapsUrl = buildGoogleMapsUrl(activity);

  return (
    <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 shadow-sm">
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
            {typeof activity.latitude === "number" && typeof activity.longitude === "number" ? (
              <p className="text-xs text-violet-700">
                {activity.latitude.toFixed(6)}, {activity.longitude.toFixed(6)}
              </p>
            ) : null}
          </div>
        </div>

        {googleMapsUrl ? (
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noreferrer"
            className="shrink-0 rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-violet-700"
          >
            Ir a Google Maps
          </a>
        ) : null}
      </div>
    </div>
  );
}
