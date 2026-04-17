import Image from "next/image";
import Link from "next/link";
import type { TripWeatherResult } from "@/lib/trip-weather";
import { wmoWeatherVisual } from "@/lib/weatherPresentation";

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
};

const TONE_STYLES: Record<TripSummaryTabDef["tone"], { border: string; chip: string; hover: string; accent: string }> = {
  cyan: {
    border: "border-cyan-200/80 hover:border-cyan-300",
    chip: "bg-cyan-50 text-cyan-900 border-cyan-200/80",
    hover: "hover:shadow-cyan-900/10",
    accent: "border-l-4 border-l-cyan-500",
  },
  emerald: {
    border: "border-emerald-200/80 hover:border-emerald-300",
    chip: "bg-emerald-50 text-emerald-900 border-emerald-200/80",
    hover: "hover:shadow-emerald-900/10",
    accent: "border-l-4 border-l-emerald-500",
  },
  amber: {
    border: "border-amber-200/80 hover:border-amber-300",
    chip: "bg-amber-50 text-amber-950 border-amber-200/80",
    hover: "hover:shadow-amber-900/10",
    accent: "border-l-4 border-l-amber-500",
  },
  violet: {
    border: "border-violet-200/80 hover:border-violet-300",
    chip: "bg-violet-50 text-violet-900 border-violet-200/80",
    hover: "hover:shadow-violet-900/10",
    accent: "border-l-4 border-l-violet-500",
  },
  slate: {
    border: "border-slate-200/80 hover:border-slate-300",
    chip: "bg-slate-50 text-slate-800 border-slate-200/80",
    hover: "hover:shadow-slate-900/10",
    accent: "border-l-4 border-l-slate-600",
  },
  rose: {
    border: "border-rose-200/80 hover:border-rose-300",
    chip: "bg-rose-50 text-rose-900 border-rose-200/80",
    hover: "hover:shadow-rose-900/10",
    accent: "border-l-4 border-l-rose-500",
  },
};

function formatShortWeekday(dateStr: string) {
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric", month: "short" }).format(d);
}

function formatActivityWhen(a: TripSummaryActivityPreview) {
  const datePart = a.activity_date
    ? new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short" }).format(new Date(`${a.activity_date}T12:00:00`))
    : "Sin fecha";
  const timePart =
    a.activity_time && /^\d{2}:\d{2}/.test(a.activity_time) ? ` · ${a.activity_time.slice(0, 5)}` : "";
  return `${datePart}${timePart}`;
}

export default function TripSummaryOverview({
  tripId,
  weather,
  weatherHint,
  todayLabel,
  plansToday,
  nextPlan,
  tabs,
}: {
  tripId: string;
  weather: TripWeatherResult | null;
  weatherHint: "ok" | "no-destination" | "unavailable";
  todayLabel: string;
  plansToday: Array<TripSummaryActivityPreview & { isPast: boolean }>;
  nextPlan: TripSummaryActivityPreview | null;
  tabs: TripSummaryTabDef[];
}) {
  const planHref = `/trip/${tripId}/plan`;

  return (
    <div className="space-y-8">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] lg:items-start">
        <section className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-slate-900 via-slate-800 to-cyan-950 p-6 text-white shadow-lg md:p-8">
          <div
            className="pointer-events-none absolute -right-16 top-0 h-40 w-40 rounded-full bg-cyan-500/20 blur-3xl"
            aria-hidden
          />
          <div className="relative space-y-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-cyan-200/90">Agenda</p>
                <h2 className="mt-1 text-xl font-extrabold tracking-tight md:text-2xl">Próximo plan y día actual</h2>
                <p className="mt-1 text-sm text-slate-300">“Hoy” según {todayLabel}</p>
              </div>
              <Link
                href={planHref}
                className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold text-white transition hover:bg-white/15"
              >
                Abrir Plan
              </Link>
            </div>

            {nextPlan ? (
              <div className="rounded-2xl border border-violet-300/45 bg-gradient-to-br from-violet-600/25 to-transparent p-4 ring-1 ring-violet-300/30">
                <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-violet-100">Próximo en el calendario</p>
                <p className="mt-1 text-xl font-extrabold text-white md:text-2xl">{nextPlan.title}</p>
                <p className="mt-1 text-sm font-semibold text-violet-100/95">{formatActivityWhen(nextPlan)}</p>
                {(nextPlan.place_name || nextPlan.address) ? (
                  <p className="mt-1 text-sm text-slate-200/95">{nextPlan.place_name || nextPlan.address}</p>
                ) : null}
              </div>
            ) : (
              <p className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3 text-sm text-slate-200">
                No hay planes futuros con fecha (y hora si aplica). Añade actividades con fecha en Plan.
              </p>
            )}

            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-200/90">Planes para hoy</p>
              {plansToday.length ? (
                <ul className="mt-2 space-y-2">
                  {plansToday.map((a) => (
                    <li
                      key={a.id}
                      className={`rounded-2xl border px-4 py-3 backdrop-blur-sm ${
                        a.isPast
                          ? "border-white/5 bg-black/15 text-slate-400"
                          : "border-white/10 bg-white/5 text-white"
                      }`}
                    >
                      <p className={`text-sm font-bold ${a.isPast ? "line-through decoration-slate-500/80" : ""}`}>
                        {a.title}
                      </p>
                      <p className="mt-0.5 text-xs font-semibold text-cyan-100/85">{formatActivityWhen(a)}</p>
                      {(a.place_name || a.address) ? (
                        <p className="mt-1 text-xs text-slate-300/90">{a.place_name || a.address}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
                  Nada anotado para la fecha de hoy. Si el viaje es otro día, mira el bloque de arriba o el Plan.
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-sky-200/70 bg-gradient-to-b from-sky-50 via-white to-violet-50/80 p-5 shadow-md md:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-sky-800">Clima en el destino</p>
              <h2 className="mt-1 text-lg font-extrabold text-slate-950">Previsión</h2>
            </div>
          </div>

          {weatherHint === "no-destination" ? (
            <p className="mt-4 text-sm leading-relaxed text-slate-600">
              Añade un <span className="font-semibold text-slate-800">destino</span> al viaje para localizar el clima
              (ciudad o región).
            </p>
          ) : weatherHint === "unavailable" ? (
            <p className="mt-4 text-sm text-slate-600">
              No se pudo obtener la previsión. Revisa que el destino sea reconocible o inténtalo más tarde.
            </p>
          ) : weather && weather.days.length ? (
            <div className="mt-4 space-y-4">
              <p className="text-xs font-semibold text-slate-600">{weather.locationLabel}</p>
              <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {weather.days.slice(0, 6).map((day) => {
                  const vis = wmoWeatherVisual(day.code);
                  return (
                    <div
                      key={day.date}
                      className="min-w-[108px] shrink-0 rounded-2xl border border-slate-200/90 bg-white/90 px-3 py-3 text-center shadow-sm"
                    >
                      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        {formatShortWeekday(day.date)}
                      </p>
                      <p className="mt-1 text-2xl leading-none" title={vis.label}>
                        {vis.emoji}
                      </p>
                      <p className="mt-2 text-xs font-extrabold text-slate-900">
                        {day.tempMax != null && day.tempMin != null ? (
                          <>
                            {Math.round(day.tempMax)}° / {Math.round(day.tempMin)}°
                          </>
                        ) : (
                          "—"
                        )}
                      </p>
                    </div>
                  );
                })}
              </div>
              <p className="text-[11px] leading-snug text-slate-500">Datos: Open-Meteo · orientativo</p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-600">Sin datos de previsión.</p>
          )}
        </section>
      </div>

      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-slate-500">Navegación rápida</p>
            <h2 className="mt-0.5 text-xl font-extrabold text-slate-950">Resumen por pestaña</h2>
            <p className="mt-1 text-sm text-slate-600">Toca una tarjeta para ir al módulo.</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {tabs.map((tab) => {
            const st = TONE_STYLES[tab.tone];
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`group relative overflow-hidden rounded-3xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg ${st.border} ${st.hover} ${st.accent}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 shadow-inner">
                    <Image src={tab.iconSrc} alt="" width={26} height={26} className="h-[26px] w-[26px] object-contain" />
                  </div>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-extrabold ${st.chip}`}
                  >
                    {tab.metric}
                  </span>
                </div>
                <p className="mt-4 text-lg font-extrabold text-slate-950">{tab.label}</p>
                <p className="mt-1 text-sm text-slate-600">{tab.subtitle}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-cyan-800 group-hover:underline">
                  Ir al módulo →
                </span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
