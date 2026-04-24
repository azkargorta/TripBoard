"use client";

import { useState } from "react";
import { WizardFormData } from "../TripWizardNew";

const INTERESTS = [
  "Gastronomía",
  "Cultura",
  "Museos",
  "Naturaleza",
  "Playas",
  "Senderismo",
  "Compras",
  "Fiesta/Noche",
  "Historia",
  "Arquitectura",
  "Arte",
  "Mercados",
];

export default function Step2Preferences({
  data,
  onNext,
  onBack,
  onError,
}: {
  data: WizardFormData;
  onNext: (data: Partial<WizardFormData>) => void;
  onBack: () => void;
  onError: (error: string | null) => void;
}) {
  const [travelersType, setTravelersType] = useState(
    data.travelersType || null
  );
  const [budgetLevel, setBudgetLevel] = useState(data.budgetLevel || null);
  const [activityPace, setActivityPace] = useState(data.activityPace || null);
  const [interests, setInterests] = useState(data.interests || []);
  const [specificDestinations, setSpecificDestinations] = useState(
    data.specificDestinations || []
  );
  const [newDestination, setNewDestination] = useState("");

  const [accommodations, setAccommodations] = useState(
    data.accommodationCities || []
  );
  const [newAccommodation, setNewAccommodation] = useState({
    city: "",
    checkInDate: "",
    checkOutDate: "",
  });

  const toggleInterest = (interest: string) => {
    setInterests((prev) =>
      prev.includes(interest)
        ? prev.filter((i) => i !== interest)
        : [...prev, interest]
    );
  };

  const addDestination = () => {
    if (newDestination.trim()) {
      setSpecificDestinations((prev) => [...prev, newDestination.trim()]);
      setNewDestination("");
    }
  };

  const removeDestination = (dest: string) => {
    setSpecificDestinations((prev) => prev.filter((d) => d !== dest));
  };

  const addAccommodation = () => {
    if (
      newAccommodation.city.trim() &&
      newAccommodation.checkInDate &&
      newAccommodation.checkOutDate
    ) {
      if (
        new Date(newAccommodation.checkInDate) >=
        new Date(newAccommodation.checkOutDate)
      ) {
        onError("La fecha de salida debe ser posterior a la de entrada");
        return;
      }
      setAccommodations((prev) => [...prev, newAccommodation]);
      setNewAccommodation({ city: "", checkInDate: "", checkOutDate: "" });
      onError(null);
    }
  };

  const removeAccommodation = (index: number) => {
    setAccommodations((prev) => prev.filter((_, i) => i !== index));
  };

  const handleNext = () => {
    onError(null);
    onNext({
      travelersType: travelersType || undefined,
      budgetLevel: budgetLevel || undefined,
      activityPace: activityPace || undefined,
      interests,
      specificDestinations,
      accommodationCities: accommodations,
    });
  };

  return (
    <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-4">
      <div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">
          Tu contexto
        </h2>
        <p className="text-slate-600">
          Ayúdanos a personalizar tu viaje (todo es opcional)
        </p>
      </div>

      {/* Tipo de Viajero */}
      <div>
        <label className="block text-sm font-medium text-slate-900 mb-3">
          Tipo de viaje
        </label>
        <div className="grid grid-cols-2 gap-2">
          {["solo", "couple", "friends", "family"].map((type) => (
            <button
              key={type}
              onClick={() =>
                setTravelersType(
                  travelersType === type
                    ? null
                    : (type as "solo" | "couple" | "friends" | "family")
                )
              }
              className={`p-3 rounded-lg border-2 font-medium transition ${
                travelersType === type
                  ? "border-violet-600 bg-violet-50 text-violet-900"
                  : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300"
              }`}
            >
              {type === "solo"
                ? "🧑 Solo"
                : type === "couple"
                  ? "👫 Pareja"
                  : type === "friends"
                    ? "👯 Amigos"
                    : "👨‍👩‍👧‍👦 Familia"}
            </button>
          ))}
        </div>
      </div>

      {/* Presupuesto */}
      <div>
        <label className="block text-sm font-medium text-slate-900 mb-3">
          Presupuesto
        </label>
        <div className="grid grid-cols-3 gap-2">
          {["low", "medium", "high"].map((level) => (
            <button
              key={level}
              onClick={() =>
                setBudgetLevel(
                  budgetLevel === level
                    ? null
                    : (level as "low" | "medium" | "high")
                )
              }
              className={`p-3 rounded-lg border-2 font-medium transition ${
                budgetLevel === level
                  ? "border-violet-600 bg-violet-50 text-violet-900"
                  : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300"
              }`}
            >
              {level === "low" ? "💰 Bajo" : level === "medium" ? "💵 Medio" : "💎 Alto"}
            </button>
          ))}
        </div>
      </div>

      {/* Ritmo de Actividades */}
      <div>
        <label className="block text-sm font-medium text-slate-900 mb-3">
          Ritmo de actividades
        </label>
        <div className="grid grid-cols-3 gap-2">
          {["relaxed", "normal", "intense"].map((pace) => (
            <button
              key={pace}
              onClick={() =>
                setActivityPace(
                  activityPace === pace
                    ? null
                    : (pace as "relaxed" | "normal" | "intense")
                )
              }
              className={`p-3 rounded-lg border-2 font-medium transition ${
                activityPace === pace
                  ? "border-violet-600 bg-violet-50 text-violet-900"
                  : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300"
              }`}
            >
              {pace === "relaxed"
                ? "🧘 Relajado"
                : pace === "normal"
                  ? "🏃 Normal"
                  : "⚡ Intenso"}
            </button>
          ))}
        </div>
      </div>

      {/* Intereses */}
      <div>
        <label className="block text-sm font-medium text-slate-900 mb-3">
          Tus intereses
        </label>
        <div className="flex flex-wrap gap-2">
          {INTERESTS.map((interest) => (
            <button
              key={interest}
              onClick={() => toggleInterest(interest)}
              className={`px-3 py-2 rounded-full text-sm font-medium transition border ${
                interests.includes(interest)
                  ? "border-violet-600 bg-violet-600 text-white"
                  : "border-slate-300 bg-slate-100 text-slate-700 hover:border-slate-400"
              }`}
            >
              {interest}
            </button>
          ))}
        </div>
      </div>

      {/* Destinos Específicos */}
      <div>
        <label className="block text-sm font-medium text-slate-900 mb-2">
          Lugares específicos a visitar (opcional)
        </label>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            placeholder="ej: Coliseo, Vaticano..."
            value={newDestination}
            onChange={(e) => setNewDestination(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && addDestination()}
            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 outline-none"
          />
          <button
            onClick={addDestination}
            className="px-4 py-2 bg-violet-100 text-violet-700 rounded-lg hover:bg-violet-200 font-medium"
          >
            + Agregar
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {specificDestinations.map((dest, idx) => (
            <div
              key={idx}
              className="px-3 py-2 bg-slate-100 rounded-lg text-sm flex items-center gap-2"
            >
              {dest}
              <button
                onClick={() => removeDestination(dest)}
                className="text-slate-500 hover:text-slate-700 font-bold"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Alojamientos por Ciudad */}
      <div className="border-t pt-6">
        <label className="block text-sm font-medium text-slate-900 mb-2">
          Ciudades donde alojarte (opcional)
        </label>
        <div className="space-y-3 mb-4">
          <div>
            <input
              type="text"
              placeholder="Ciudad"
              value={newAccommodation.city}
              onChange={(e) =>
                setNewAccommodation({ ...newAccommodation, city: e.target.value })
              }
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 outline-none mb-2"
            />
            <div className="grid grid-cols-2 gap-2 mb-3">
              <input
                type="date"
                value={newAccommodation.checkInDate}
                onChange={(e) =>
                  setNewAccommodation({
                    ...newAccommodation,
                    checkInDate: e.target.value,
                  })
                }
                className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 outline-none"
                placeholder="Check-in"
              />
              <input
                type="date"
                value={newAccommodation.checkOutDate}
                onChange={(e) =>
                  setNewAccommodation({
                    ...newAccommodation,
                    checkOutDate: e.target.value,
                  })
                }
                className="px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-500 outline-none"
                placeholder="Check-out"
              />
            </div>
            <button
              onClick={addAccommodation}
              className="w-full px-4 py-2 bg-violet-100 text-violet-700 rounded-lg hover:bg-violet-200 font-medium"
            >
              + Agregar alojamiento
            </button>
          </div>
        </div>
        <div className="space-y-2">
          {accommodations.map((acc, idx) => (
            <div
              key={idx}
              className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex justify-between items-center"
            >
              <div>
                <p className="font-medium text-slate-900">{acc.city}</p>
                <p className="text-xs text-slate-600">
                  {acc.checkInDate} → {acc.checkOutDate}
                </p>
              </div>
              <button
                onClick={() => removeAccommodation(idx)}
                className="text-slate-500 hover:text-slate-700 font-bold text-lg"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Botones */}
      <div className="flex justify-between pt-6 border-t">
        <button
          onClick={onBack}
          className="px-6 py-3 border border-slate-300 text-slate-700 font-semibold rounded-lg hover:bg-slate-50 transition"
        >
          ← Atrás
        </button>
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
