"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase } from "@/lib/supabase";

function withTimeout<T>(promise: Promise<T>, ms = 10000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("La operación tardó demasiado")), ms)
    ),
  ]);
}

export default function CreateTripForm() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [baseCurrency, setBaseCurrency] = useState("EUR");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreateTrip(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    setError(null);

    const trimmedName = name.trim();
    const trimmedDestination = destination.trim();

    if (!trimmedName) {
      setError("El nombre del viaje es obligatorio.");
      return;
    }

    if (startDate && endDate && startDate > endDate) {
      setError("La fecha de inicio no puede ser posterior a la fecha de fin.");
      return;
    }

    setLoading(true);

    try {
      const sessionResult = await withTimeout(supabase.auth.getSession(), 5000);
      const session = sessionResult.data.session;

      if (!session?.user) {
        throw new Error("No hay sesión activa.");
      }

      const user = session.user;

      const tripInsertResult = await withTimeout(
        supabase
          .from("trips")
          .insert({
            name: trimmedName,
            destination: trimmedDestination || null,
            start_date: startDate || null,
            end_date: endDate || null,
            base_currency: baseCurrency || "EUR",
          })
          .select("id")
          .single(),
        10000
      );

      const tripData = tripInsertResult.data;
      const tripError = tripInsertResult.error;

      if (tripError || !tripData) {
        throw tripError || new Error("No se pudo crear el viaje.");
      }

      const newTripId = tripData.id as string;

      const participantInsertResult = await withTimeout(
        supabase.from("trip_participants").insert({
          trip_id: newTripId,
          display_name:
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            user.user_metadata?.username ||
            user.email ||
            "Usuario",
          username:
            user.user_metadata?.username ||
            user.email?.split("@")[0] ||
            null,
          joined_via: "owner",
          user_id: user.id,
          role: "owner",
        }),
        10000
      );

      if (participantInsertResult.error) {
        await supabase.from("trips").delete().eq("id", newTripId);
        throw participantInsertResult.error;
      }

      setName("");
      setDestination("");
      setStartDate("");
      setEndDate("");
      setBaseCurrency("EUR");

      window.location.href = `/trip/${newTripId}`;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo crear el viaje."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleCreateTrip} className="card-soft p-6">
      <div className="mb-5">
        <h2 className="mb-2 text-2xl font-bold">Crear nuevo viaje</h2>
        <p className="text-slate-600">
          Crea un viaje y automáticamente quedarás añadido como owner.
        </p>
      </div>

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="mb-1 block text-sm font-medium">
            Nombre del viaje
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
            placeholder="Ej. Japón 2026"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Destino</label>
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
            placeholder="Ej. Tokio"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Moneda base</label>
          <select
            value={baseCurrency}
            onChange={(e) => setBaseCurrency(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
          >
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
            <option value="GBP">GBP</option>
            <option value="JPY">JPY</option>
            <option value="CHF">CHF</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Fecha inicio</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Fecha fin</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-500"
          />
        </div>
      </div>

      <div className="mt-6">
        <button
          type="submit"
          disabled={loading}
          className="btn-primary disabled:opacity-50"
        >
          {loading ? "Creando viaje..." : "Crear viaje"}
        </button>
      </div>
    </form>
  );
}