"use client";

type TripSettingsViewProps = {
  tripId: string;
  readOnly?: boolean;
};

export default function TripSettingsView({
  tripId,
  readOnly = false,
}: TripSettingsViewProps) {
  return (
    <div className="space-y-4">
      {readOnly && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
          Modo lectura activado: no puedes cambiar ajustes del viaje.
        </div>
      )}

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        Aquí va tu implementación real de ajustes para el viaje {tripId}.
      </div>
    </div>
  );
}
