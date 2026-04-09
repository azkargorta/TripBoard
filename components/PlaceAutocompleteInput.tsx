"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type AutocompletePayload = {
  address: string;
  latitude: number | null;
  longitude: number | null;
};

type PredictionItem = {
  id: string;
  description: string;
  placeId: string;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelect: (payload: AutocompletePayload) => void;
  label?: string;
  placeholder?: string;
  className?: string;
};

export default function PlaceAutocompleteInput({
  value,
  onChange,
  onPlaceSelect,
  label,
  placeholder = "Busca un lugar",
  className = "",
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [predictions, setPredictions] = useState<PredictionItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const requestIdRef = useRef(0);

  // No memorizamos: el script de Google puede cargarse tras montar el componente
  const canUseGoogle = typeof window !== "undefined" && !!window.google?.maps?.places;

  useEffect(() => {
    function handleOutside(event: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  useEffect(() => {
    if (!canUseGoogle) return;

    const text = value.trim();
    if (text.length < 3) {
      setPredictions([]);
      return;
    }

    let cancelled = false;
    const currentRequestId = ++requestIdRef.current;

    async function loadPredictions() {
      try {
        setLoading(true);
        setError(null);

        const service = new window.google.maps.places.AutocompleteService();
        const result = await service.getPlacePredictions({
          input: text,
          types: ["geocode"],
        });

        if (cancelled || currentRequestId != requestIdRef.current) return;

        const next = (result.predictions || []).map((prediction) => ({
          id: prediction.place_id,
          description: prediction.description,
          placeId: prediction.place_id,
        }));

        setPredictions(next);
        setIsOpen(true);
      } catch (err) {
        console.error("Autocomplete error", err);
        if (!cancelled) {
          setError("No se pudo cargar el autocompletar.");
          setPredictions([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    const timer = window.setTimeout(loadPredictions, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [value, canUseGoogle]);

  async function resolvePrediction(prediction: PredictionItem) {
    if (!canUseGoogle) return;

    try {
      setLoading(true);
      setError(null);

      const place = await new Promise<google.maps.places.PlaceResult>((resolve, reject) => {
        const container = document.createElement("div");
        const service = new window.google.maps.places.PlacesService(container);

        service.getDetails(
          {
            placeId: prediction.placeId,
            fields: ["formatted_address", "geometry", "name"],
          },
          (result, status) => {
            if (
              status === window.google.maps.places.PlacesServiceStatus.OK &&
              result
            ) {
              resolve(result);
            } else {
              reject(new Error(String(status)));
            }
          }
        );
      });

      const lat = place.geometry?.location?.lat?.() ?? null;
      const lng = place.geometry?.location?.lng?.() ?? null;
      const address =
        place.formatted_address || place.name || prediction.description || value;

      onChange(address);
      onPlaceSelect({
        address,
        latitude: lat,
        longitude: lng,
      });

      setPredictions([]);
      setIsOpen(false);
    } catch (err) {
      console.error("Place details error", err);

      try {
        const geocoder = new window.google.maps.Geocoder();
        const geocodeResult = await geocoder.geocode({
          address: prediction.description,
        });
        const location = geocodeResult.results?.[0]?.geometry?.location;

        const lat = location?.lat?.() ?? null;
        const lng = location?.lng?.() ?? null;
        const address =
          geocodeResult.results?.[0]?.formatted_address ||
          prediction.description ||
          value;

        onChange(address);
        onPlaceSelect({
          address,
          latitude: lat,
          longitude: lng,
        });

        setPredictions([]);
        setIsOpen(false);
      } catch (fallbackErr) {
        console.error("Geocode fallback error", fallbackErr);
        setError("No se pudieron obtener las coordenadas del lugar.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {label ? (
        <label className="mb-2 block text-sm font-medium text-slate-700">
          {label}
        </label>
      ) : null}

      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onFocus={() => {
          if (predictions.length > 0) setIsOpen(true);
        }}
        onChange={(e) => {
          onChange(e.target.value);
        }}
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
      />

      {loading ? (
        <div className="mt-2 text-xs text-slate-500">Buscando lugares...</div>
      ) : null}

      {error ? (
        <div className="mt-2 text-xs text-red-600">{error}</div>
      ) : null}

      {isOpen && predictions.length > 0 ? (
        <div className="absolute z-50 mt-2 max-h-64 w-full overflow-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
          {predictions.map((prediction) => (
            <button
              key={prediction.id}
              type="button"
              onClick={() => void resolvePrediction(prediction)}
              className="flex w-full rounded-xl px-3 py-3 text-left text-sm text-slate-700 transition hover:bg-slate-50"
            >
              {prediction.description}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
