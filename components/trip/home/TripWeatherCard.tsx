"use client";

import { useEffect, useState } from "react";

type WeatherDay = {
  date: string;
  tempMax: number | null;
  tempMin: number | null;
  code: number | null;
};

type WeatherPayload = {
  locationLabel: string;
  days: WeatherDay[];
};

type Props = {
  tripId: string;
  destination: string | null;
};

function weatherLabel(code: number | null) {
  if (code == null) return "Sin datos";
  if ([0].includes(code)) return "Despejado";
  if ([1, 2].includes(code)) return "Poco nuboso";
  if ([3].includes(code)) return "Cubierto";
  if ([45, 48].includes(code)) return "Niebla";
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return "Lluvia";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Nieve";
  if ([95, 96, 99].includes(code)) return "Tormenta";
  return "Variable";
}

function weatherEmoji(code: number | null) {
  if (code == null) return "📍";
  if ([0].includes(code)) return "☀️";
  if ([1, 2].includes(code)) return "⛅";
  if ([3].includes(code)) return "☁️";
  if ([45, 48].includes(code)) return "🌫️";
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return "🌧️";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "❄️";
  if ([95, 96, 99].includes(code)) return "⛈️";
  return "🌤️";
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(new Date(`${date}T00:00:00`));
}

export default function TripWeatherCard({ tripId, destination }: Props) {
  const [data, setData] = useState<WeatherPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadWeather() {
      if (!destination) {
        setLoading(false);
        setData(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/trips/${tripId}/weather`, { cache: "no-store" });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(payload?.error || "No se pudo cargar el clima.");
        }

        if (!cancelled) {
          setData(payload as WeatherPayload);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "No se pudo cargar el clima.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadWeather();

    return () => {
      cancelled = true;
    };
  }, [tripId, destination]);

  return (
    <div className="card-soft p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-600">Clima</p>
          <h3 className="mt-1 text-2xl font-bold text-slate-950">Próximos 7 días</h3>
          <p className="mt-1 text-sm text-slate-600">{data?.locationLabel || destination || "Añade el destino del viaje para activar el clima."}</p>
        </div>
        <div className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
          Previsión rápida
        </div>
      </div>

      {!destination ? (
        <div className="mt-5 rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">
          Define el destino del viaje para mostrar la previsión meteorológica.
        </div>
      ) : loading ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : error ? (
        <div className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : data?.days?.length ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data.days.map((day) => (
            <div key={day.date} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-slate-900">{formatDate(day.date)}</span>
                <span className="text-2xl">{weatherEmoji(day.code)}</span>
              </div>
              <p className="mt-3 text-sm text-slate-600">{weatherLabel(day.code)}</p>
              <p className="mt-2 text-lg font-bold text-slate-950">
                {day.tempMax != null ? `${Math.round(day.tempMax)}°` : "—"}
                <span className="ml-2 text-sm font-medium text-slate-500">
                  {day.tempMin != null ? `${Math.round(day.tempMin)}°` : "—"}
                </span>
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">
          No se pudo generar la previsión para este destino.
        </div>
      )}
    </div>
  );
}
