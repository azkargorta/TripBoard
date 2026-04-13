"use client";

import { useEffect, useRef, useState } from "react";

type AutocompletePayload = {
  address: string;
  latitude: number | null;
  longitude: number | null;
};

type PredictionItem = {
  id: string;
  description: string;
  latitude: number | null;
  longitude: number | null;
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
        const resp = await fetch(`/api/places/search?q=${encodeURIComponent(text)}&limit=6`, {
          method: "GET",
          cache: "no-store",
        });
        const payload = await resp.json().catch(() => null);
        if (!resp.ok) throw new Error(payload?.error || `Error ${resp.status}`);
        if (cancelled || currentRequestId != requestIdRef.current) return;

        const next = (Array.isArray(payload?.places) ? payload.places : []).map((p: any) => ({
          id: String(p?.id || crypto.randomUUID()),
          description: String(p?.label || p?.address || "").trim(),
          latitude: typeof p?.latitude === "number" ? p.latitude : null,
          longitude: typeof p?.longitude === "number" ? p.longitude : null,
        })).filter((p: any) => p.description);

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
  }, [value]);

  async function resolvePrediction(prediction: PredictionItem) {
    try {
      setLoading(true);
      setError(null);
      const address = prediction.description || value;
      onChange(address);
      onPlaceSelect({
        address,
        latitude: prediction.latitude,
        longitude: prediction.longitude,
      });
      setPredictions([]);
      setIsOpen(false);
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
