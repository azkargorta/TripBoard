"use client";

import { useEffect, useState } from "react";

type WeatherDay = {
  date: string;
  weatherCode: number;
  weatherLabel: string;
  tempMax: number | null;
  tempMin: number | null;
  precipitation: number | null;
  windMax: number | null;
};

type WeatherResponse = {
  resolvedLocation?: string;
  days?: WeatherDay[];
  error?: string;
};

function iconForCode(code: number) {
  if (code === 0) return "☀️";
  if ([1, 2].includes(code)) return "🌤️";
  if (code === 3) return "☁️";
  if ([45, 48].includes(code)) return "🌫️";
  if ([51, 53, 55, 56, 57].includes(code)) return "🌦️";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "🌧️";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "❄️";
  if ([95, 96, 99].includes(code)) return "⛈️";
  return "🌍";
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("es-ES", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
    }).format(new Date(`${value}T00:00:00`));
  } catch {
    return value;
  }
}

export default function TripWeatherCard({ location }: { location: string | null | undefined }) {
  const [data, setData] = useState<WeatherResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const place = String(location || "").trim();

    if (!place) {
      setData(null);
      setError("Indica un destino del viaje para ver el clima de los próximos 7 días.");
      return;
    }

    let cancelled = false;

    async function loadWeather() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/weather/forecast?location=${encodeURIComponent(place)}`, {
          cache: "no-store",
        });

        const payload = (await response.json().catch(() => null)) as WeatherResponse | null;

        if (!response.ok) {
          throw new Error(payload?.error || "No se pudo cargar el clima.");
        }

        if (!cancelled) {
          setData(payload);
        }
      } catch (err) {
        if (!cancelled) {
          setData(null);
          setError(err instanceof Error ? err.message : "No se pudo cargar el clima.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadWeather();

    return () => {
      cancelled = true;
    };
  }, [location]);

  return (
    <section className="card-soft p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
            Clima
          </div>
          <h2 className="mt-3 text-2xl font-bold text-slate-950">Próximos 7 días</h2>
          <p className="mt-2 text-sm text-slate-600">
            {data?.resolvedLocation || location || "Destino pendiente"}
          </p>
        </div>
      </div>

      {loading ? <p className="text-sm text-slate-500">Cargando previsión...</p> : null}
      {!loading && error ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          {error}
        </div>
      ) : null}

      {!loading && !error && data?.days?.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          {data.days.map((day) => (
            <div
              key={day.date}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{formatDate(day.date)}</p>
                  <p className="mt-1 text-xs text-slate-500">{day.weatherLabel}</p>
                </div>
                <div className="text-3xl">{iconForCode(day.weatherCode)}</div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-600">
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-400">Temperatura</div>
                  <div className="mt-1 font-semibold text-slate-900">
                    {day.tempMax ?? "—"}° / {day.tempMin ?? "—"}°
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-400">Lluvia</div>
                  <div className="mt-1 font-semibold text-slate-900">{day.precipitation ?? 0} mm</div>
                </div>
                <div className="col-span-2">
                  <div className="text-xs uppercase tracking-wide text-slate-400">Viento máx.</div>
                  <div className="mt-1 font-semibold text-slate-900">{day.windMax ?? 0} km/h</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
