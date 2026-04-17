"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ui/toast";

function withTimeout<T>(promiseLike: PromiseLike<T>, ms = 25000, label = "operación"): Promise<T> {
  return Promise.race([
    Promise.resolve(promiseLike),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`La operación tardó demasiado (${label})`)), ms)
    ),
  ]);
}

export default function CreateTripForm({ isPremium = false }: { isPremium?: boolean }) {
  const router = useRouter();
  const toast = useToast();

  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [baseCurrency, setBaseCurrency] = useState("EUR");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"idle" | "trip" | "participant" | "done">("idle");

  const currencyOptions = useMemo(() => {
    const values: string[] =
      typeof Intl !== "undefined" && typeof (Intl as any).supportedValuesOf === "function"
        ? ((Intl as any).supportedValuesOf("currency") as string[])
        : ["EUR", "USD", "GBP", "JPY", "CHF"];

    const dn =
      typeof Intl !== "undefined" && typeof (Intl as any).DisplayNames === "function"
        ? new (Intl as any).DisplayNames(["es-ES"], { type: "currency" })
        : null;

    return values
      .filter((c) => typeof c === "string" && /^[A-Z]{3}$/.test(c))
      .sort()
      .map((code) => ({
        code,
        label: dn ? `${code} · ${dn.of(code)}` : code,
      }));
  }, []);

  useEffect(() => {
    if (!startDate) return;
    // Si aún no hay fin, o si fin < inicio, ajustamos fin = inicio (mínimo permitido)
    if (!endDate || endDate < startDate) {
      setEndDate(startDate);
    }
  }, [startDate]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreateTrip(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    setError(null);
    setStep("idle");

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
      setStep("trip");
      const createResult = await withTimeout(
        fetch("/api/trips", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: trimmedName,
            destination: trimmedDestination || null,
            start_date: startDate || null,
            end_date: endDate || null,
            base_currency: baseCurrency || "EUR",
          }),
        }),
        25000,
        "crear viaje"
      );

      const payload = await createResult.json().catch(() => null);
      if (!createResult.ok) {
        throw new Error(payload?.error || "No se pudo crear el viaje.");
      }
      const newTripId = String(payload?.tripId || "");
      if (!newTripId) throw new Error("No se pudo crear el viaje (sin id).");

      setName("");
      setDestination("");
      setStartDate("");
      setEndDate("");
      setBaseCurrency("EUR");

      setStep("done");
      if (isPremium) {
        toast.success("Viaje creado", "Te llevamos al asistente personal para montar el viaje.");
        router.push(`/trip/${newTripId}/ai-chat`);
      } else {
        toast.success("Viaje creado", "Te llevamos al resumen del viaje.");
        router.push(`/trip/${newTripId}`);
      }
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "No se pudo crear el viaje.";
      setError(msg);
      toast.error("No se pudo crear el viaje", msg);
    } finally {
      setLoading(false);
      setStep("idle");
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
            {currencyOptions.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
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
            min={startDate || undefined}
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
          {loading
            ? step === "trip"
              ? "Creando viaje..."
              : "Creando..."
            : "Crear viaje"}
        </button>
      </div>
    </form>
  );
}