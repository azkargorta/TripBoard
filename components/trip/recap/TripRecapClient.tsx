"use client";

import { useRef } from "react";
import Link from "next/link";
import { MapPin, Calendar, Users, Wallet, Compass, Download, Share2 } from "lucide-react";

const KIND_LABELS: Record<string, string> = {
  culture: "Cultura 🏛️", nature: "Naturaleza 🌿", viewpoint: "Miradores 🌄",
  neighborhood: "Barrios 🧭", market: "Mercados 🧺", excursion: "Excursiones 🚌",
  gastro_experience: "Gastronomía 🍷", shopping: "Compras 🛍️", night: "Vida nocturna 🌙",
  transport: "Traslados ✈️", visit: "Visitas 📍",
};

const BG_COLORS = ["bg-violet-500", "bg-emerald-500", "bg-amber-500", "bg-pink-500", "bg-sky-500", "bg-orange-500", "bg-indigo-500"];

function formatMoney(n: number, currency: string) {
  try { return new Intl.NumberFormat("es-ES", { style: "currency", currency, maximumFractionDigits: 0 }).format(n); }
  catch { return `${Math.round(n)} ${currency}`; }
}

function formatDate(d: string | null) {
  if (!d) return "";
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${d}T12:00:00`));
}

type Props = {
  tripId: string; tripName: string; destination: string | null;
  startDate: string | null; endDate: string | null; totalDays: number;
  activitiesCount: number; totalExpenses: number; currency: string;
  participantsCount: number; cities: string[]; kindCounts: Record<string, number>; kmTravelled: number;
};

export default function TripRecapClient({ tripId, tripName, destination, startDate, endDate, totalDays, activitiesCount, totalExpenses, currency, participantsCount, cities, kindCounts, kmTravelled }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);

  const topKinds = Object.entries(kindCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const totalActivities = Object.values(kindCounts).reduce((a, b) => a + b, 0);

  function shareText() {
    const text = `🌍 Viaje "${tripName}" — ${totalDays} días en ${destination || "varios destinos"}\n✅ ${activitiesCount} actividades · ${kmTravelled > 0 ? `${kmTravelled} km · ` : ""}${formatMoney(totalExpenses, currency)}\nOrganizado con Kaviro`;
    if (navigator.share) {
      void navigator.share({ title: `Recap: ${tripName}`, text });
    } else {
      void navigator.clipboard.writeText(text);
      alert("¡Copiado al portapapeles!");
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-start py-8 px-4 gap-6">
      {/* Back */}
      <div className="w-full max-w-sm">
        <Link href={`/trip/${tripId}`} className="text-slate-500 text-xs font-semibold hover:text-slate-300">← Volver al viaje</Link>
      </div>

      {/* Main card */}
      <div ref={cardRef} className="w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl">
        {/* Header gradient */}
        <div className="bg-gradient-to-br from-violet-600 via-violet-700 to-indigo-800 px-6 pt-8 pb-6 text-white">
          <p className="text-violet-200 text-xs font-bold uppercase tracking-widest mb-2">✈️ Viaje completado</p>
          <h1 className="text-2xl font-extrabold leading-tight">{tripName}</h1>
          {destination && (
            <p className="text-violet-200 mt-1 text-sm font-medium flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 shrink-0" />{destination}
            </p>
          )}
          {startDate && endDate && (
            <p className="text-violet-300 mt-1 text-xs font-semibold flex items-center gap-1.5">
              <Calendar className="w-3 h-3 shrink-0" />{formatDate(startDate)} → {formatDate(endDate)}
            </p>
          )}
        </div>

        {/* Stats grid */}
        <div className="bg-white grid grid-cols-2 divide-x divide-y divide-slate-100">
          <div className="p-4 text-center">
            <p className="text-3xl font-extrabold text-slate-900">{totalDays}</p>
            <p className="text-xs font-semibold text-slate-400 mt-0.5">días de viaje</p>
          </div>
          <div className="p-4 text-center">
            <p className="text-3xl font-extrabold text-slate-900">{activitiesCount}</p>
            <p className="text-xs font-semibold text-slate-400 mt-0.5">actividades</p>
          </div>
          <div className="p-4 text-center">
            <p className="text-2xl font-extrabold text-slate-900">{totalExpenses > 0 ? formatMoney(totalExpenses, currency) : "—"}</p>
            <p className="text-xs font-semibold text-slate-400 mt-0.5">gasto total</p>
          </div>
          <div className="p-4 text-center">
            {kmTravelled > 0 ? (
              <>
                <p className="text-3xl font-extrabold text-slate-900">{kmTravelled > 999 ? `${(kmTravelled / 1000).toFixed(1)}k` : kmTravelled}</p>
                <p className="text-xs font-semibold text-slate-400 mt-0.5">km aprox.</p>
              </>
            ) : (
              <>
                <p className="text-3xl font-extrabold text-slate-900">{participantsCount}</p>
                <p className="text-xs font-semibold text-slate-400 mt-0.5">viajeros</p>
              </>
            )}
          </div>
        </div>

        {/* Activity breakdown */}
        {topKinds.length > 0 && (
          <div className="bg-white border-t border-slate-100 px-5 py-4">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">Lo que más hicisteis</p>
            <div className="space-y-2">
              {topKinds.map(([kind, count], i) => (
                <div key={kind} className="flex items-center gap-2">
                  <div className={`h-2 rounded-full ${BG_COLORS[i % BG_COLORS.length]}`} style={{ width: `${Math.round((count / totalActivities) * 100)}%`, minWidth: 8, maxWidth: "70%" }} />
                  <span className="text-xs font-semibold text-slate-700 truncate">{KIND_LABELS[kind] ?? kind}</span>
                  <span className="ml-auto text-xs font-bold text-slate-400">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cities */}
        {cities.length > 0 && (
          <div className="bg-slate-50 border-t border-slate-100 px-5 py-4">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Destinos visitados</p>
            <div className="flex flex-wrap gap-1.5">
              {cities.map((c) => (
                <span key={c} className="rounded-full bg-white border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700">{c}</span>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="bg-slate-900 px-5 py-3 flex items-center justify-between">
          <p className="text-slate-500 text-xs font-semibold">Organizado con <span className="text-violet-400 font-bold">Kaviro</span></p>
          <Compass className="w-4 h-4 text-violet-500" />
        </div>
      </div>

      {/* Share / download actions */}
      <div className="flex gap-3 w-full max-w-sm">
        <button
          type="button"
          onClick={shareText}
          className="flex-1 flex items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-bold text-white hover:bg-slate-700 transition"
        >
          <Share2 className="w-4 h-4" />
          Compartir
        </button>
        <Link
          href={`/trip/${tripId}/plan`}
          className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-bold text-white hover:bg-violet-700 transition"
        >
          Ver el plan
        </Link>
      </div>

      <p className="text-slate-600 text-xs text-center max-w-xs">
        Comparte tu resumen del viaje con el grupo o guárdalo como recuerdo.
      </p>
    </div>
  );
}
