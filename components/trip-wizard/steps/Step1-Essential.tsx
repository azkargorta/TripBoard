"use client";

import { useState } from "react";
import { WizardFormData } from "../TripWizardNew";

function calculateDurationDays(startIso: string, endIso: string) {
  const start = new Date(`${startIso}T12:00:00`);
  const end = new Date(`${endIso}T12:00:00`);
  const diffMs = end.getTime() - start.getTime();
  if (Number.isNaN(diffMs) || diffMs <= 0) return 0;
  return Math.round(diffMs / (1000 * 60 * 60 * 24)) + 1;
}

export default function Step1Essential({
  data,
  onNext,
  onError,
}: {
  data: WizardFormData;
  onNext: (data: Partial<WizardFormData>) => void;
  onError: (error: string | null) => void;
}) {
  const [tripName, setTripName] = useState(data.tripName || "");
  const [destination, setDestination] = useState(data.destination || "");
  const [startDate, setStartDate] = useState(data.startDate || "");
  const [endDate, setEndDate] = useState(data.endDate || "");

  const handleNext = () => {
    // Validaciones
    if (!tripName.trim()) {
      onError("Por favor, ingresa un nombre para el viaje");
      return;
    }
    if (!destination.trim()) {
      onError("Por favor, ingresa un destino");
      return;
    }
    if (!startDate) {
      onError("Por favor, selecciona una fecha de inicio");
      return;
    }
    if (!endDate) {
      onError("Por favor, selecciona una fecha de fin");
      return;
    }

    if (new Date(startDate) >= new Date(endDate)) {
      onError("La fecha de fin debe ser posterior a la de inicio");
      return;
    }

    const durationDays = calculateDurationDays(startDate, endDate);

    onError(null);
    onNext({
      tripName: tripName.trim(),
      destination: destination.trim(),
      startDate,
      endDate,
      durationDays,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">
          Lo esencial
        </h2>
        <p className="text-slate-600">
          Cuéntanos lo básico sobre tu viaje para empezar
        </p>
      </div>

      {/* Nombre del Viaje */}
      <div>
        <label className="block text-sm font-medium text-slate-900 mb-2">
          Nombre del viaje <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          placeholder="ej: Italia 2025, Road Trip España..."
          value={tripName}
          onChange={(e) => setTripName(e.target.value)}
          className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none transition"
        />
      </div>

      {/* Destino */}
      <div>
        <label className="block text-sm font-medium text-slate-900 mb-2">
          Destino principal <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          placeholder="ej: Italia, Barcelona, Tailandia..."
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none transition"
        />
      </div>

      {/* Fechas */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-900 mb-2">
            Fecha de inicio <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none transition"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-900 mb-2">
            Fecha de fin <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none transition"
          />
        </div>
      </div>

      {/* Duración calculada */}
      {startDate && endDate && new Date(startDate) < new Date(endDate) && (
        <div className="p-4 bg-violet-50 border border-violet-200 rounded-lg">
          <p className="text-sm text-violet-900">
            <span className="font-semibold">Duración:</span>{" "}
            {calculateDurationDays(startDate, endDate)} días
          </p>
        </div>
      )}

      {/* Botón Siguiente */}
      <div className="flex justify-end pt-6">
        <button
          onClick={handleNext}
          className="px-6 py-3 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-lg transition shadow-md"
        >
          Siguiente →
        </button>
      </div>
    </div>
  );
}
