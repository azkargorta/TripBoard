"use client";

import PlaceAutocompleteInput from "@/components/PlaceAutocompleteInput";

type Props = {
  label: string;
  addressValue: string;
  latitude: number | null;
  longitude: number | null;
  onAddressChange: (value: string) => void;
  onPlaceResolved: (payload: {
    address: string;
    latitude: number | null;
    longitude: number | null;
    city?: string | null;
    country?: string | null;
  }) => void;
};

export default function ResourcePlaceAutocompleteField({
  label,
  addressValue,
  latitude,
  longitude,
  onAddressChange,
  onPlaceResolved,
}: Props) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-semibold text-slate-900">{label}</label>

      <PlaceAutocompleteInput
        value={addressValue}
        onChange={onAddressChange}
        onPlaceSelect={onPlaceResolved}
        placeholder="Busca una dirección o lugar"
      />

      {latitude != null && longitude != null ? (
        <p className="text-xs text-slate-500">
          Coordenadas: {latitude.toFixed(6)}, {longitude.toFixed(6)}
        </p>
      ) : (
        <p className="text-xs text-slate-400">
          Selecciona una sugerencia para guardar coordenadas.
        </p>
      )}
    </div>
  );
}
