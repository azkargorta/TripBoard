"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  CalendarDays, MapPin, Users, Wallet, FileText,
  Clock, ChevronRight, Sparkles, CheckCircle2, AlertCircle,
} from "lucide-react";
import type { TripWeatherResult } from "@/lib/trip-weather";
import TripAiInsights from "@/components/trip/overview/TripAiInsights";

type Activity = {
  id: string;
  title: string;
  activity_date?: string | null;
  activity_time?: string | null;
  place_name?: string | null;
  activity_kind?: string | null;
};

type Props = {
  tripId: string;
  tripName: string;
  destination: string | null;
  startDate: string | null;
  endDate: string | null;
  phase: "before" | "during" | "after";
  daysUntilStart: number | null;
  daysUntilEnd: number | null;
  daysElapsed: number | null;
  totalTripDays: number | null;
  activitiesCount: number;
  completedActivities: number;
  completionPct: number;
  expensesCount: number;
  totalExpenses: number;
  currency: string;
  participantsCount: number;
  resourcesCount: number;
  nextActivity: Activity | null;
  todayActivities: Activity[];
  weather: TripWeatherResult | null;
  isPremium: boolean;
  canEdit: boolean;
};

const KIND_META: Record<string, { icon: string; color: string }> = {
  culture:           { icon: "🏛️", color: "bg-amber-100 text-amber-800" },
  nature:            { icon: "🌿", color: "bg-emerald-100 text-emerald-800" },
  viewpoint:         { icon: "🌄", color: "bg-sky-100 text-sky-800" },
  neighborhood:      { icon: "🧭", color: "bg-slate-100 text-slate-700" },
  market:            { icon: "🧺", color: "bg-orange-100 text-orange-800" },
  excursion:         { icon: "🚌", color: "bg-blue-100 text-blue-800" },
  gastro_experience: { icon: "🍷", color: "bg-pink-100 text-pink-800" },
  shopping:          { icon: "🛍️", color: "bg-purple-100 text-purple-800" },
  night:             { icon: "🌙", color: "bg-indigo-100 text-indigo-800" },
  transport:         { icon: "✈️", color: "bg-slate-100 text-slate-600" },
};

function kindMeta(kind?: string | null) {
  return KIND_META[kind || ""] ?? { icon: "📍", color: "bg-slate-100 text-slate-700" };
}

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency", currency, maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${Math.round(amount)} ${currency}`;
  }
}

function formatShortDate(dateStr: string | null | undefined) {
  if (!dateStr) return "";
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(
    new Date(`${dateStr}T12:00:00`)
  );
}

function WMOIcon({ code }: { code: number | null }) {
  if (code === null) return <>🌡️</>;
  if (code === 0) return <>☀️</>;
  if (code <= 3) return <>⛅</>;
  if (code <= 49) return <>🌫️</>;
  if (code <= 69) return <>🌧️</>;
  if (code <= 79) return <>🌨️</>;
  if (code <= 84) return <>🌦️</>;
  return <>⛈️</>;
}

export default function TripOverviewClient({
  tripId, destination, phase,
  daysUntilStart, daysUntilEnd, daysElapsed, totalTripDays,
  activitiesCount, completedActivities, completionPct,
  expensesCount, totalExpenses, currency,
  participantsCount, resourcesCount,
  nextActivity, todayActivities, weather, isPremium, canEdit,
}: Props) {

  // Hero message depending on phase
  const hero = useMemo(() => {
    if (phase === "before" && daysUntilStart !== null) {
      if (daysUntilStart === 0) return { label: "El viaje empieza hoy 🎉", sub: "¡Todo listo para arrancar!" };
      if (daysUntilStart === 1) return { label: "Mañana empieza el viaje ✈️", sub: "Última noche en casa." };
      return { label: `${daysUntilStart} días para el viaje`, sub: "Hay tiempo — sigue preparando el plan." };
    }
    if (phase === "during" && daysUntilEnd !== null) {
      if (daysUntilEnd === 0) return { label: "Último día del viaje 🥂", sub: "Aprovéchalo al máximo." };
      return { label: `Día ${daysElapsed} de ${totalTripDays}`, sub: `Quedan ${daysUntilEnd} días.` };
    }
    if (phase === "after") {
      return { label: "Viaje completado 🏁", sub: `${activitiesCount} actividades · ${formatMoney(totalExpenses, currency)} gastado` };
    }
    return { label: "Tu viaje", sub: destination ?? "" };
  }, [phase, daysUntilStart, daysUntilEnd, daysElapsed, totalTripDays, activitiesCount, totalExpenses, currency, destination]);

  // Today's weather
  const todayStr = new Intl.DateTimeFormat("en-CA").format(new Date());
  const todayWeather = weather?.days.find((d) => d.date === todayStr) ?? null;

  return (
    <div className="space-y-5">

      {/* ── Hero countdown card ─────────────────────────────────────────── */}
      <div className="card-soft px-6 py-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-2xl font-extrabold tracking-tight text-slate-900">{hero.label}</p>
          <p className="mt-0.5 text-sm font-medium text-slate-500">{hero.sub}</p>
          {destination && (
            <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-slate-400">
              <MapPin className="w-3.5 h-3.5" />
              {destination}
            </div>
          )}
        </div>
        {/* Progress bar for "during" phase */}
        {phase === "during" && totalTripDays && (
          <div className="min-w-[160px]">
            <div className="flex justify-between text-xs font-semibold text-slate-500 mb-1.5">
              <span>Progreso del viaje</span>
              <span>{Math.round(((daysElapsed ?? 0) / totalTripDays) * 100)}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-violet-500 transition-all"
                style={{ width: `${Math.min(100, ((daysElapsed ?? 0) / totalTripDays) * 100)}%` }}
              />
            </div>
            {todayWeather && (
              <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                <WMOIcon code={todayWeather.code} />
                {todayWeather.tempMax !== null && `${Math.round(todayWeather.tempMax)}°`}
                {todayWeather.tempMin !== null && ` / ${Math.round(todayWeather.tempMin)}°`}
                <span className="text-slate-400">hoy en {weather?.locationLabel}</span>
              </div>
            )}
          </div>
        )}
        {/* Countdown ring for "before" phase */}
        {phase === "before" && daysUntilStart !== null && daysUntilStart <= 30 && (
          <div className="flex flex-col items-center">
            <div className="w-16 h-16 rounded-full border-4 border-violet-100 flex items-center justify-center">
              <span className="text-xl font-extrabold text-violet-600">{daysUntilStart}</span>
            </div>
            <span className="mt-1 text-xs font-semibold text-slate-400">días</span>
          </div>
        )}
      </div>

      {/* ── Stats grid ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Activities */}
        <Link href={`/trip/${tripId}/plan`} className="card-soft px-4 py-4 flex flex-col gap-1 hover:border-violet-200 transition-colors group">
          <div className="flex items-center justify-between">
            <CalendarDays className="w-4 h-4 text-violet-400" />
            <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-violet-400 transition-colors" />
          </div>
          <p className="text-2xl font-extrabold text-slate-900 mt-1">{activitiesCount}</p>
          <p className="text-xs font-semibold text-slate-500">Planes</p>
          {activitiesCount > 0 && (
            <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full bg-violet-400" style={{ width: `${completionPct}%` }} />
            </div>
          )}
        </Link>

        {/* Expenses */}
        <Link href={`/trip/${tripId}/expenses`} className="card-soft px-4 py-4 flex flex-col gap-1 hover:border-emerald-200 transition-colors group">
          <div className="flex items-center justify-between">
            <Wallet className="w-4 h-4 text-emerald-500" />
            <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-emerald-400 transition-colors" />
          </div>
          <p className="text-xl font-extrabold text-slate-900 mt-1 truncate">
            {expensesCount > 0 ? formatMoney(totalExpenses, currency) : "—"}
          </p>
          <p className="text-xs font-semibold text-slate-500">{expensesCount} gastos</p>
        </Link>

        {/* Participants */}
        <Link href={`/trip/${tripId}/participants`} className="card-soft px-4 py-4 flex flex-col gap-1 hover:border-blue-200 transition-colors group">
          <div className="flex items-center justify-between">
            <Users className="w-4 h-4 text-blue-400" />
            <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-400 transition-colors" />
          </div>
          <p className="text-2xl font-extrabold text-slate-900 mt-1">{participantsCount}</p>
          <p className="text-xs font-semibold text-slate-500">Personas</p>
        </Link>

        {/* Resources */}
        <Link href={`/trip/${tripId}/resources`} className="card-soft px-4 py-4 flex flex-col gap-1 hover:border-amber-200 transition-colors group">
          <div className="flex items-center justify-between">
            <FileText className="w-4 h-4 text-amber-500" />
            <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-amber-400 transition-colors" />
          </div>
          <p className="text-2xl font-extrabold text-slate-900 mt-1">{resourcesCount}</p>
          <p className="text-xs font-semibold text-slate-500">Documentos</p>
        </Link>
      </div>

      {/* ── Today's activities (during phase) ───────────────────────────── */}
      {phase === "during" && todayActivities.length > 0 && (
        <div className="card-soft p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-violet-500" />
              <span className="text-sm font-extrabold text-slate-900">Hoy</span>
            </div>
            <Link href={`/trip/${tripId}/plan`} className="text-xs font-semibold text-violet-600 hover:text-violet-800">
              Ver plan →
            </Link>
          </div>
          <div className="space-y-2">
            {todayActivities.slice(0, 5).map((a) => {
              const meta = kindMeta(a.activity_kind);
              return (
                <div key={a.id} className="flex items-center gap-3 py-1.5">
                  <span className="text-base shrink-0">{meta.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{a.title}</p>
                    {a.place_name && <p className="text-xs text-slate-400 truncate">{a.place_name}</p>}
                  </div>
                  {a.activity_time && (
                    <span className="text-xs font-bold text-slate-400 shrink-0">{a.activity_time.slice(0, 5)}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Next activity (before / during) ─────────────────────────────── */}
      {nextActivity && phase !== "after" && (
        <Link href={`/trip/${tripId}/plan`} className="card-soft p-5 flex items-start gap-4 hover:border-violet-200 transition-colors group">
          <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-lg ${kindMeta(nextActivity.activity_kind).color}`}>
            {kindMeta(nextActivity.activity_kind).icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-0.5">Próxima actividad</p>
            <p className="text-sm font-extrabold text-slate-900 truncate">{nextActivity.title}</p>
            <div className="flex items-center gap-2 mt-0.5 text-xs font-semibold text-slate-500">
              {nextActivity.activity_date && <span>{formatShortDate(nextActivity.activity_date)}</span>}
              {nextActivity.activity_time && <span>· {nextActivity.activity_time.slice(0, 5)}</span>}
              {nextActivity.place_name && <span>· {nextActivity.place_name}</span>}
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-violet-400 mt-1 shrink-0 transition-colors" />
        </Link>
      )}

      {/* ── Completion summary (after phase) ────────────────────────────── */}
      {phase === "after" && (
        <div className="card-soft p-6 text-center space-y-3">
          <div className="text-4xl">🏁</div>
          <p className="text-lg font-extrabold text-slate-900">¡Viaje completado!</p>
          <p className="text-sm font-medium text-slate-500 max-w-xs mx-auto">
            {activitiesCount} actividades realizadas{totalExpenses > 0 ? ` · ${formatMoney(totalExpenses, currency)} gastado en total` : ""}.
          </p>
          <div className="flex flex-wrap gap-2 justify-center mt-2">
            <Link href={`/trip/${tripId}/plan`} className="btn-secondary text-xs py-2 px-4">Ver plan completo</Link>
            <Link href={`/trip/${tripId}/expenses`} className="btn-secondary text-xs py-2 px-4">Ver gastos</Link>
          </div>
        </div>
      )}

      {/* ── Quick actions ────────────────────────────────────────────────── */}
      <div className="card-soft p-5">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Accesos rápidos</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <Link href={`/trip/${tripId}/plan`} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 hover:border-violet-300 hover:bg-violet-50 transition-colors">
            <CalendarDays className="w-3.5 h-3.5 text-violet-500" />Plan del viaje
          </Link>
          <Link href={`/trip/${tripId}/map`} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 hover:border-emerald-300 hover:bg-emerald-50 transition-colors">
            <MapPin className="w-3.5 h-3.5 text-emerald-500" />Mapa y rutas
          </Link>
          <Link href={`/trip/${tripId}/expenses`} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 hover:border-amber-300 hover:bg-amber-50 transition-colors">
            <Wallet className="w-3.5 h-3.5 text-amber-500" />Gastos
          </Link>
          <Link href={`/trip/${tripId}/participants`} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 hover:border-blue-300 hover:bg-blue-50 transition-colors">
            <Users className="w-3.5 h-3.5 text-blue-500" />Participantes
          </Link>
          <Link href={`/trip/${tripId}/resources`} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 hover:border-orange-300 hover:bg-orange-50 transition-colors">
            <FileText className="w-3.5 h-3.5 text-orange-500" />Documentos
          </Link>
          {isPremium ? (
            <Link href={`/trip/${tripId}/ai-chat`} className="flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5 text-xs font-semibold text-violet-700 hover:bg-violet-100 transition-colors">
              <Sparkles className="w-3.5 h-3.5 text-violet-500" />Asistente IA
            </Link>
          ) : (
            <Link href="/pricing" className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-400 hover:border-violet-200 transition-colors">
              <Sparkles className="w-3.5 h-3.5 text-slate-300" />Premium
            </Link>
          )}
        </div>
      </div>

      {/* ── AI Insights — brief + packing list ──────────────────────────── */}
      <TripAiInsights tripId={tripId} isPremium={isPremium} />

    </div>
  );
}
