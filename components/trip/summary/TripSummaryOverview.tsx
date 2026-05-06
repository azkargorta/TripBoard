import Image from "next/image";
import Link from "next/link";
import type { TripWeatherResult } from "@/lib/trip-weather";
import { wmoWeatherVisual } from "@/lib/weatherPresentation";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TripSummaryActivityPreview = {
  id: string;
  title: string;
  activity_date: string | null;
  activity_time: string | null;
  place_name: string | null;
  address: string | null;
};

export type TripSummaryTabDef = {
  href: string;
  label: string;
  subtitle: string;
  metric: string;
  iconSrc: string;
  tone: "cyan" | "emerald" | "amber" | "violet" | "slate" | "rose";
  hint?: string | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatShortWeekday(dateStr: string) {
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short" }).format(d);
}

function formatActivityWhen(a: TripSummaryActivityPreview) {
  const datePart = a.activity_date
    ? new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short" }).format(new Date(`${a.activity_date}T12:00:00`))
    : "Sin fecha";
  const timePart = a.activity_time && /^\d{2}:\d{2}/.test(a.activity_time) ? ` · ${a.activity_time.slice(0, 5)}` : "";
  return `${datePart}${timePart}`;
}

function buildMapsUrl(a: TripSummaryActivityPreview) {
  const q = a.place_name || a.address;
  if (!q) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

function todayYMD() {
  return new Intl.DateTimeFormat("en-CA").format(new Date());
}

function tripPhase(startDate: string | null | undefined, endDate: string | null | undefined) {
  const today = todayYMD();
  if (!startDate || !endDate) return "unknown" as const;
  if (today < startDate) return "before" as const;
  if (today > endDate) return "after" as const;
  return "during" as const;
}

function daysBetween(a: string, b: string) {
  return Math.round(
    (new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / (86400 * 1000)
  );
}

function formatFullDate(d: string) {
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric" }).format(
    new Date(`${d}T12:00:00`)
  );
}

// ─── Tile accent colors per tone ──────────────────────────────────────────────

const TILE_ACCENT: Record<TripSummaryTabDef["tone"], { bg: string; border: string; icon: string; chip: string; arrow: string }> = {
  violet:  { bg: "bg-violet-50",  border: "border-violet-200/70", icon: "bg-violet-100", chip: "bg-violet-100 text-violet-800",  arrow: "text-violet-600" },
  cyan:    { bg: "bg-sky-50",     border: "border-sky-200/70",    icon: "bg-sky-100",    chip: "bg-sky-100 text-sky-800",       arrow: "text-sky-600"    },
  emerald: { bg: "bg-emerald-50", border: "border-emerald-200/70",icon: "bg-emerald-100",chip: "bg-emerald-100 text-emerald-800",arrow: "text-emerald-600"},
  amber:   { bg: "bg-amber-50",   border: "border-amber-200/70",  icon: "bg-amber-100",  chip: "bg-amber-100 text-amber-800",   arrow: "text-amber-600"  },
  slate:   { bg: "bg-slate-50",   border: "border-slate-200/70",  icon: "bg-slate-100",  chip: "bg-slate-100 text-slate-700",   arrow: "text-slate-500"  },
  rose:    { bg: "bg-rose-50",    border: "border-rose-200/70",   icon: "bg-rose-100",   chip: "bg-rose-100 text-rose-800",     arrow: "text-rose-600"   },
};

// ─── Subcomponents ────────────────────────────────────────────────────────────

// R6 — Progress bar for active trip
function TripProgressBar({ startDate, endDate }: { startDate: string; endDate: string }) {
  const today = todayYMD();
  const total = daysBetween(startDate, endDate) + 1;
  const elapsed = Math.min(total, Math.max(0, daysBetween(startDate, today) + 1));
  const pct = Math.round((elapsed / total) * 100);
  return (
    <div className="mt-4">
      <div className="flex justify-between text-xs font-semibold text-slate-400 mb-1.5">
        <span>Día {elapsed} de {total}</span>
        <span>{pct}% completado</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/20 overflow-hidden">
        <div
          className="h-full rounded-full bg-white/70 transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TripSummaryOverview({
  tripId,
  weather,
  weatherHint,
  todayLabel,
  plansToday,
  nextPlan,
  tabs,
  // R1: accept trip dates for countdown
  tripStartDate,
  tripEndDate,
  tripDestination,
  activitiesCount,
}: {
  tripId: string;
  weather: TripWeatherResult | null;
  weatherHint: "ok" | "no-destination" | "unavailable";
  todayLabel: string;
  plansToday: Array<TripSummaryActivityPreview & { isPast: boolean }>;
  nextPlan: TripSummaryActivityPreview | null;
  tabs: TripSummaryTabDef[];
  // Optional — for R1 hero and R6 progress bar
  tripStartDate?: string | null;
  tripEndDate?: string | null;
  tripDestination?: string | null;
  activitiesCount?: number;
}) {
  const planHref = `/trip/${tripId}/plan`;
  const phase = tripPhase(tripStartDate, tripEndDate);
  const today = todayYMD();

  // Countdown / progress data
  const daysUntilStart = tripStartDate && phase === "before"
    ? daysBetween(today, tripStartDate)
    : null;
  const daysLeft = tripEndDate && phase === "during"
    ? daysBetween(today, tripEndDate)
    : null;
  const totalDays = tripStartDate && tripEndDate
    ? daysBetween(tripStartDate, tripEndDate) + 1
    : null;

  return (
    <div className="w-full min-w-0 space-y-5 md:space-y-6">

      {/* ── R1+R2+R4+R5+R6 — Hero rediseñado ─────────────────────────────── */}
      <div className="grid gap-4 md:gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,340px)] lg:items-start">

        {/* Hero card — countdown + today's plan + next activity */}
        <section className="relative overflow-hidden rounded-3xl border border-slate-900/10 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6 text-white shadow-xl md:p-7">
          {/* Subtle glow */}
          <div className="pointer-events-none absolute -right-20 -top-10 h-52 w-52 rounded-full bg-violet-500/15 blur-3xl" aria-hidden />
          <div className="pointer-events-none absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-indigo-500/10 blur-3xl" aria-hidden />

          <div className="relative">
            {/* R1 — Countdown / state hero */}
            <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
              <div>
                {/* Phase-aware headline */}
                {phase === "before" && daysUntilStart !== null && (
                  <>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-300/90">Cuenta atrás</p>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-5xl font-extrabold tabular-nums leading-none">{daysUntilStart}</span>
                      <span className="text-lg font-semibold text-slate-300">día{daysUntilStart !== 1 ? "s" : ""} para el viaje</span>
                    </div>
                    {tripStartDate && (
                      <p className="mt-1 text-sm text-slate-400">{formatFullDate(tripStartDate)}</p>
                    )}
                  </>
                )}
                {phase === "during" && daysLeft !== null && (
                  <>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300/90">Viaje en curso ✈️</p>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="text-5xl font-extrabold tabular-nums leading-none">{daysLeft}</span>
                      <span className="text-lg font-semibold text-slate-300">día{daysLeft !== 1 ? "s" : ""} restantes</span>
                    </div>
                    {tripDestination && (
                      <p className="mt-1 text-sm text-slate-400">📍 {tripDestination}</p>
                    )}
                  </>
                )}
                {phase === "after" && (
                  <>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Viaje completado 🏁</p>
                    <p className="mt-1 text-2xl font-extrabold">
                      {totalDays !== null ? `${totalDays} días` : "Resumen"}
                    </p>
                    {tripDestination && <p className="mt-1 text-sm text-slate-400">{tripDestination}</p>}
                  </>
                )}
                {phase === "unknown" && (
                  <>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Tu viaje</p>
                    <p className="mt-1 text-2xl font-extrabold">Añade fechas para ver la cuenta atrás</p>
                  </>
                )}
              </div>

              <Link
                href={planHref}
                className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold text-white transition hover:bg-white/20"
              >
                Ver Plan →
              </Link>
            </div>

            {/* R6 — Progress bar (only during) */}
            {phase === "during" && tripStartDate && tripEndDate && (
              <TripProgressBar startDate={tripStartDate} endDate={tripEndDate} />
            )}

            {/* R5 — Empty state */}
            {(activitiesCount ?? 0) === 0 && (
              <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                <p className="text-sm font-bold text-white">🗺️ Sin actividades todavía</p>
                <p className="mt-1 text-xs text-slate-300">Crea tu primer plan o usa el asistente IA para generar el itinerario completo.</p>
                <Link
                  href={planHref}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-violet-700"
                >
                  Ir al Plan →
                </Link>
              </div>
            )}

            {/* Today's activities */}
            {plansToday.length > 0 && (
              <div className="mt-5">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-300/90 mb-2">Planes para hoy</p>
                <ul className="space-y-2">
                  {plansToday.map((a) => (
                    <li
                      key={a.id}
                      className={`rounded-2xl border px-4 py-3 ${
                        a.isPast
                          ? "border-white/5 bg-black/15 text-slate-400"
                          : "border-white/10 bg-white/5 text-white"
                      }`}
                    >
                      <p className={`text-sm font-semibold ${a.isPast ? "line-through decoration-slate-500/80" : ""}`}>
                        {a.title}
                      </p>
                      <p className="mt-0.5 text-xs text-violet-200/80">{formatActivityWhen(a)}</p>
                      {(a.place_name || a.address) && (
                        <p className="mt-0.5 text-xs text-slate-400">{a.place_name || a.address}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* R4 — Next activity as featured card */}
            {nextPlan && (
              <div className="mt-5 rounded-2xl border border-violet-400/30 bg-gradient-to-br from-violet-600/25 to-transparent p-4 ring-1 ring-violet-400/20">
                <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-violet-200">Próximo en el calendario</p>
                <p className="mt-1.5 text-xl font-extrabold text-white leading-snug">{nextPlan.title}</p>
                <p className="mt-1 text-sm font-semibold text-violet-200/90">{formatActivityWhen(nextPlan)}</p>
                {(nextPlan.place_name || nextPlan.address) && (
                  <p className="mt-0.5 text-xs text-slate-300">{nextPlan.place_name || nextPlan.address}</p>
                )}
                {/* Maps button */}
                {buildMapsUrl(nextPlan) && (
                  <a
                    href={buildMapsUrl(nextPlan)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
                  >
                    📍 Cómo llegar
                  </a>
                )}
              </div>
            )}

            {!nextPlan && (activitiesCount ?? 0) > 0 && (
              <p className="mt-5 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
                No hay planes futuros con fecha. Añade fechas en Plan.
              </p>
            )}
          </div>
        </section>

        {/* R2 — Weather integrado como columna derecha */}
        <section className="min-w-0 rounded-3xl border border-sky-200/60 bg-gradient-to-b from-sky-50 via-white to-slate-50 p-5 shadow-md md:p-6">
          <div className="flex items-start justify-between gap-2 mb-4">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-sky-700">Clima en el destino</p>
              <p className="mt-0.5 text-lg font-extrabold text-slate-900">Previsión</p>
            </div>
            <span className="text-2xl">🌤️</span>
          </div>

          {weatherHint === "no-destination" ? (
            <p className="text-sm text-slate-500">Añade un <span className="font-semibold text-slate-800">destino</span> al viaje para ver el clima.</p>
          ) : weatherHint === "unavailable" ? (
            <p className="text-sm text-slate-500">No se pudo obtener la previsión. Revisa que el destino sea reconocible.</p>
          ) : weather && weather.days.length ? (
            <div className="space-y-4">
              <p className="text-xs font-semibold text-slate-500">{weather.locationLabel}</p>
              {/* Today highlight */}
              {(() => {
                const todayW = weather.days.find((d) => d.date === today);
                const vis = todayW ? wmoWeatherVisual(todayW.code) : null;
                if (!todayW || !vis) return null;
                return (
                  <div className="flex items-center gap-4 rounded-2xl bg-white border border-slate-200 px-4 py-3 shadow-sm">
                    <span className="text-4xl">{vis.emoji}</span>
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Hoy</p>
                      <p className="text-2xl font-extrabold text-slate-900 tabular-nums leading-tight">
                        {todayW.tempMax != null ? `${Math.round(todayW.tempMax)}°` : "—"}
                        <span className="text-base font-semibold text-slate-400 ml-1">
                          / {todayW.tempMin != null ? `${Math.round(todayW.tempMin)}°` : "—"}
                        </span>
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">{vis.label}</p>
                    </div>
                  </div>
                );
              })()}
              {/* Rest of week */}
              <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                {weather.days.filter((d) => d.date !== today).slice(0, 5).map((day) => {
                  const vis = wmoWeatherVisual(day.code);
                  return (
                    <div key={day.date} className="min-w-[80px] shrink-0 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-center shadow-sm">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{formatShortWeekday(day.date)}</p>
                      <p className="mt-1 text-xl">{vis.emoji}</p>
                      <p className="mt-1.5 text-xs font-extrabold text-slate-800 tabular-nums">
                        {day.tempMax != null && day.tempMin != null
                          ? `${Math.round(day.tempMax)}° / ${Math.round(day.tempMin)}°`
                          : "—"}
                      </p>
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-slate-400">Datos: Open-Meteo · orientativo</p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Sin datos de previsión.</p>
          )}
        </section>
      </div>

      {/* ── R3 — Navigation tiles rediseñados ──────────────────────────────── */}
      <section className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-slate-400">Navegación rápida</p>
            <h2 className="mt-0.5 text-xl font-extrabold text-slate-950">Módulos del viaje</h2>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {tabs.map((tab) => {
            const ac = TILE_ACCENT[tab.tone];
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`group flex flex-col rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${ac.border}`}
              >
                {/* Top row: icon + metric */}
                <div className="flex items-start justify-between gap-3">
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${ac.icon}`}>
                    <Image src={tab.iconSrc} alt="" width={24} height={24} className="h-6 w-6 object-contain" />
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${ac.chip}`}>
                    {tab.metric}
                  </span>
                </div>

                {/* Label + subtitle */}
                <p className="mt-3 text-[15px] font-extrabold text-slate-950 leading-tight">{tab.label}</p>
                <p className="mt-0.5 text-xs text-slate-500 leading-snug">{tab.subtitle}</p>

                {/* Hint */}
                {tab.hint && (
                  <p className="mt-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-700 leading-snug line-clamp-2">
                    {tab.hint}
                  </p>
                )}

                {/* Arrow */}
                <div className={`mt-3 flex items-center gap-1 text-xs font-bold transition group-hover:gap-2 ${ac.arrow}`}>
                  <span>Ir al módulo</span>
                  <span aria-hidden>→</span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
