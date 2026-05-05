"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { MapPin, Clock, ChevronRight, Navigation, Phone, ExternalLink, Calendar } from "lucide-react";

type Activity = {
  id: string;
  title: string;
  description?: string | null;
  activity_date?: string | null;
  activity_time?: string | null;
  place_name?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  activity_kind?: string | null;
  activity_type?: string | null;
};

const KIND_META: Record<string, { icon: string; color: string; bg: string }> = {
  culture:           { icon: "🏛️", color: "text-amber-800", bg: "bg-amber-50" },
  nature:            { icon: "🌿", color: "text-emerald-800", bg: "bg-emerald-50" },
  viewpoint:         { icon: "🌄", color: "text-sky-800", bg: "bg-sky-50" },
  neighborhood:      { icon: "🧭", color: "text-slate-700", bg: "bg-slate-50" },
  market:            { icon: "🧺", color: "text-orange-800", bg: "bg-orange-50" },
  excursion:         { icon: "🚌", color: "text-blue-800", bg: "bg-blue-50" },
  gastro_experience: { icon: "🍷", color: "text-pink-800", bg: "bg-pink-50" },
  shopping:          { icon: "🛍️", color: "text-purple-800", bg: "bg-purple-50" },
  night:             { icon: "🌙", color: "text-indigo-800", bg: "bg-indigo-50" },
  transport:         { icon: "✈️", color: "text-slate-600", bg: "bg-slate-50" },
};

function kindMeta(kind?: string | null) {
  return KIND_META[kind || ""] ?? { icon: "📍", color: "text-slate-700", bg: "bg-slate-50" };
}

function formatTime(time: string | null | undefined) {
  if (!time) return null;
  return time.slice(0, 5);
}

function formatDate(d: string) {
  return new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long" }).format(new Date(`${d}T12:00:00`));
}

function buildGmapsUrl(activity: Activity): string | null {
  if (activity.latitude && activity.longitude) {
    return `https://www.google.com/maps/dir/?api=1&destination=${activity.latitude},${activity.longitude}`;
  }
  if (activity.address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(activity.address)}`;
  }
  return null;
}

type Props = {
  tripId: string;
  tripName: string;
  destination: string | null;
  today: string;
  isActive: boolean;
  tripStart: string;
  tripEnd: string;
  todayActivities: Activity[];
  upcoming: Activity[];
  canEdit: boolean;
};

export default function TripTodayClient({ tripId, tripName, destination, today, isActive, tripStart, tripEnd, todayActivities, upcoming, canEdit }: Props) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(id);
  }, []);

  // Find current/next activity
  const nowHHMM = currentTime.toTimeString().slice(0, 5);
  const currentActivity = todayActivities.find((a) => {
    const t = formatTime(a.activity_time);
    return t && t <= nowHHMM;
  }) ?? todayActivities[0] ?? null;
  const nextActivity = todayActivities.find((a) => {
    const t = formatTime(a.activity_time);
    return t && t > nowHHMM;
  }) ?? null;

  if (!isActive) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center gap-4">
        <div className="text-5xl">📅</div>
        <h1 className="text-xl font-extrabold text-slate-900">{tripName}</h1>
        <p className="text-sm font-medium text-slate-500">
          {today < tripStart
            ? `El viaje empieza el ${formatDate(tripStart)}`
            : `El viaje terminó el ${formatDate(tripEnd)}`}
        </p>
        <Link href={`/trip/${tripId}/plan`} className="btn-primary text-sm py-2.5 px-5 mt-2">
          Ver el plan completo
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">
      {/* Header */}
      <div className="px-5 pt-safe-top pt-6 pb-4 bg-gradient-to-b from-slate-900 to-slate-800">
        <div className="flex items-center justify-between mb-1">
          <Link href={`/trip/${tripId}`} className="text-slate-400 text-xs font-semibold hover:text-slate-200">← {tripName}</Link>
          <span className="text-slate-400 text-xs font-semibold">{currentTime.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
        <h1 className="text-2xl font-extrabold">{formatDate(today)}</h1>
        {destination && <p className="text-slate-400 text-sm font-medium mt-0.5 flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{destination}</p>}
      </div>

      {/* Current activity spotlight */}
      {currentActivity && (
        <div className="mx-4 mt-4 rounded-3xl bg-violet-600 p-5">
          <p className="text-violet-200 text-xs font-bold uppercase tracking-widest mb-2">Ahora mismo</p>
          <div className="flex items-start gap-3">
            <span className="text-3xl shrink-0">{kindMeta(currentActivity.activity_kind).icon}</span>
            <div className="flex-1 min-w-0">
              <p className="font-extrabold text-lg leading-tight">{currentActivity.title}</p>
              {currentActivity.place_name && <p className="text-violet-200 text-sm mt-0.5">{currentActivity.place_name}</p>}
              {currentActivity.description && <p className="text-violet-200 text-xs mt-1 line-clamp-2">{currentActivity.description}</p>}
            </div>
          </div>
          {/* Navigate button */}
          {buildGmapsUrl(currentActivity) && (
            <a
              href={buildGmapsUrl(currentActivity)!}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-white/20 hover:bg-white/30 px-4 py-3 text-sm font-bold transition"
            >
              <Navigation className="w-4 h-4" />
              Cómo llegar
            </a>
          )}
        </div>
      )}

      {/* Next activity */}
      {nextActivity && (
        <div className="mx-4 mt-3 rounded-3xl bg-slate-800 p-4 flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 ${kindMeta(nextActivity.activity_kind).bg}`}>
            {kindMeta(nextActivity.activity_kind).icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Próximo</p>
            <p className="font-bold text-sm truncate">{nextActivity.title}</p>
            {formatTime(nextActivity.activity_time) && (
              <p className="text-slate-400 text-xs flex items-center gap-1 mt-0.5">
                <Clock className="w-3 h-3" />{formatTime(nextActivity.activity_time)}
              </p>
            )}
          </div>
          {buildGmapsUrl(nextActivity) && (
            <a href={buildGmapsUrl(nextActivity)!} target="_blank" rel="noopener noreferrer" className="shrink-0 w-9 h-9 rounded-xl bg-slate-700 flex items-center justify-center hover:bg-slate-600 transition">
              <Navigation className="w-4 h-4 text-slate-300" />
            </a>
          )}
        </div>
      )}

      {/* Today's full schedule */}
      {todayActivities.length > 0 && (
        <div className="mx-4 mt-4 rounded-3xl bg-slate-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Plan de hoy — {todayActivities.length} actividades</p>
          </div>
          <div className="divide-y divide-slate-700">
            {todayActivities.map((a, i) => {
              const meta = kindMeta(a.activity_kind);
              const isCurrent = a.id === currentActivity?.id;
              const isPast = formatTime(a.activity_time) ? formatTime(a.activity_time)! < nowHHMM : false;
              const mapsUrl = buildGmapsUrl(a);
              return (
                <div key={a.id} className={`px-4 py-3 flex items-center gap-3 ${isCurrent ? "bg-violet-900/30" : ""} ${isPast && !isCurrent ? "opacity-50" : ""}`}>
                  <span className={`text-xl shrink-0 ${isPast && !isCurrent ? "grayscale" : ""}`}>{meta.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${isCurrent ? "text-violet-200" : ""} truncate`}>{a.title}</p>
                    {formatTime(a.activity_time) && <p className="text-slate-400 text-xs">{formatTime(a.activity_time)}</p>}
                  </div>
                  {mapsUrl && (
                    <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 text-slate-500 hover:text-slate-300">
                      <Navigation className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {todayActivities.length === 0 && (
        <div className="mx-4 mt-4 rounded-3xl bg-slate-800 p-6 text-center">
          <p className="text-slate-400 text-sm">No hay actividades programadas para hoy.</p>
          {canEdit && (
            <Link href={`/trip/${tripId}/plan`} className="inline-flex items-center gap-1.5 mt-3 text-sm font-semibold text-violet-400 hover:text-violet-200">
              Añadir al plan <ChevronRight className="w-4 h-4" />
            </Link>
          )}
        </div>
      )}

      {/* Upcoming days preview */}
      {upcoming.length > 0 && (
        <div className="mx-4 mt-4 mb-8">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2 px-1">Próximos días</p>
          <div className="space-y-2">
            {upcoming.map((a) => (
              <div key={a.id} className="flex items-center gap-3 rounded-2xl bg-slate-800/60 px-4 py-3">
                <span className="text-lg shrink-0">{kindMeta(a.activity_kind).icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{a.title}</p>
                  {a.activity_date && <p className="text-slate-400 text-xs">{formatDate(a.activity_date)}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Emergency numbers */}
      <div className="mx-4 mb-safe-bottom mb-8 mt-auto pt-4">
        <a
          href="tel:112"
          className="flex items-center justify-center gap-2 rounded-2xl border border-red-800 bg-red-900/30 px-4 py-3 text-red-300 text-sm font-bold hover:bg-red-900/50 transition"
        >
          <Phone className="w-4 h-4" />
          Emergencias: 112
        </a>
      </div>
    </div>
  );
}
