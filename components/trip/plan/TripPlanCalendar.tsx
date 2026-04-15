"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import type { TripActivity } from "@/hooks/useTripActivities";

function toYmd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseYmd(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  return new Date(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function startOfCalendarGrid(month: Date) {
  // Semana comienza en lunes (es-ES)
  const first = startOfMonth(month);
  const dow = (first.getDay() + 6) % 7; // 0=lunes ... 6=domingo
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - dow);
  return gridStart;
}

function sameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function formatMonthTitle(d: Date) {
  return new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(d);
}

const weekDays = ["L", "M", "X", "J", "V", "S", "D"];

export default function TripPlanCalendar({
  activities,
  selectedDate,
  onSelectDate,
}: {
  activities: TripActivity[];
  selectedDate: string | null;
  onSelectDate: (ymd: string | null) => void;
}) {
  const dateCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of activities) {
      const d = a.activity_date || "";
      if (!d) continue;
      map.set(d, (map.get(d) || 0) + 1);
    }
    return map;
  }, [activities]);

  const firstActivityDate = useMemo(() => {
    const dates = Array.from(dateCounts.keys()).sort();
    return dates[0] || toYmd(new Date());
  }, [dateCounts]);

  const [month, setMonth] = useState(() => startOfMonth(parseYmd(selectedDate || firstActivityDate)));

  const gridStart = useMemo(() => startOfCalendarGrid(month), [month]);
  const days = useMemo(() => {
    const out: Date[] = [];
    const d = new Date(gridStart);
    for (let i = 0; i < 42; i++) {
      out.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, [gridStart]);

  return (
    <section className="card-soft p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-extrabold text-slate-950">
          <CalendarDays className="h-4 w-4 text-slate-700" />
          Calendario
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMonth((m) => addMonths(m, -1))}
            className="inline-flex min-h-[36px] items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            title="Mes anterior"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <div className="min-w-[220px] text-center text-sm font-bold text-slate-950 capitalize">
            {formatMonthTitle(month)}
          </div>
          <button
            type="button"
            onClick={() => setMonth((m) => addMonths(m, 1))}
            className="inline-flex min-h-[36px] items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            title="Mes siguiente"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onSelectDate(null)}
            className="inline-flex min-h-[36px] items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-extrabold text-slate-700 hover:bg-slate-50"
            title="Ver todo (sin filtrar)"
          >
            Ver todo
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-2 text-center text-xs font-extrabold text-slate-500">
        {weekDays.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-7 gap-2">
        {days.map((d) => {
          const ymd = toYmd(d);
          const count = dateCounts.get(ymd) || 0;
          const inMonth = sameMonth(d, month);
          const active = selectedDate === ymd;
          return (
            <button
              key={ymd}
              type="button"
              onClick={() => onSelectDate(ymd)}
              className={`relative min-h-[56px] rounded-2xl border p-2 text-left transition ${
                active
                  ? "border-cyan-300 bg-cyan-50"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              } ${inMonth ? "" : "opacity-45"}`}
              title={count ? `${count} actividades` : "Sin actividades"}
            >
              <div className="text-xs font-extrabold text-slate-900">{d.getDate()}</div>
              {count ? (
                <div className="mt-2 inline-flex items-center rounded-full bg-slate-950 px-2 py-0.5 text-[11px] font-extrabold text-white">
                  {count}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}

