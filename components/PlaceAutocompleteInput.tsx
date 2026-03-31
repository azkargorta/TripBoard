"use client";

import { useEffect, useRef } from "react";

type PlaceAutocompleteInputProps = {
  label?: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onPlaceSelect?: (payload: {
    address: string;
    latitude: number | null;
    longitude: number | null;
    city?: string | null;
    country?: string | null;
  }) => void;
  className?: string;
};

declare global {
  interface Window {
    google?: typeof google;
  }
}

function extractComponent(
  components: google.maps.GeocoderAddressComponent[] | undefined,
  type: string
) {
  return (
    components?.find((component) => component.types.includes(type))?.long_name || null
  );
}

export default function PlaceAutocompleteInput({
  label,
  value,
  placeholder = "Busca una dirección o lugar",
  onChange,
  onPlaceSelect,
  className = "",
}: PlaceAutocompleteInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  useEffect(() => {
    if (!inputRef.current) return;
    if (!window.google?.maps?.places) return;
    if (autocompleteRef.current) return;

    const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
      fields: ["formatted_address", "geometry", "name", "address_components"],
      types: ["establishment", "geocode"],
    });

    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (!place) return;

      const formattedAddress =
        place.formatted_address || place.name || inputRef.current?.value || "";

      const city =
        extractComponent(place.address_components, "locality") ||
        extractComponent(place.address_components, "postal_town");

      const country = extractComponent(place.address_components, "country");

      const latitude =
        typeof place.geometry?.location?.lat === "function"
          ? place.geometry.location.lat()
          : null;

      const longitude =
        typeof place.geometry?.location?.lng === "function"
          ? place.geometry.location.lng()
          : null;

      onChange(formattedAddress);
      onPlaceSelect?.({
        address: formattedAddress,
        latitude,
        longitude,
        city,
        country,
      });
    });

    autocompleteRef.current = autocomplete;

    return () => {
      if (autocompleteRef.current && window.google?.maps?.event) {
        window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
    };
  }, [onChange, onPlaceSelect]);

  useEffect(() => {
    if (inputRef.current && inputRef.current.value !== value) {
      inputRef.current.value = value || "";
    }
  }, [value]);

  return (
    <label className={`block space-y-2 ${className}`}>
      {label ? <span className="text-sm font-semibold text-slate-800">{label}</span> : null}

      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
          }
        }}
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none focus:border-slate-400"
      />
    </label>
  );
}
