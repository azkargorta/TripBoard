"use client";

import { useEffect, useState } from "react";
import type { DetectedDocumentData } from "@/lib/document-analyzer";
import PlaceAutocompleteInput from "@/components/PlaceAutocompleteInput";

export type LodgingReservationFormData = {
  providerName: string;
  reservationName: string;
  reservationCode: string;
  address: string;
  city: string;
  country: string;
  checkInDate: string;
  checkInTime: string;
  checkOutDate: string;
  checkOutTime: string;
  guests: string;
  totalAmount: string;
  currency: string;
  paymentStatus: "paid" | "pending";
  notes: string;
  syncToPlan: boolean;
  latitude: number | null;
  longitude: number | null;
};

export type LodgingReservationEditableData = {
  providerName?: string | null;
  reservationName?: string | null;
  reservationCode?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  checkInDate?: string | null;
  checkInTime?: string | null;
  checkOutDate?: string | null;
  checkOutTime?: string | null;
  guests?: number | null;
  totalAmount?: number | null;
  currency?: string | null;
  paymentStatus?: "paid" | "pending" | null;
  notes?: string | null;
  syncToPlan?: boolean | null;
  latitude?: number | null;
  longitude?: number | null;
};

type Props = {
  saving?: boolean;
  detectedData?: DetectedDocumentData | null;
  initialData?: LodgingReservationEditableData | null;
  isEditing?: boolean;
  onCancelEdit?: () => void;
  onSubmit: (data: LodgingReservationFormData) => Promise<void>;
};

const EMPTY_FORM: LodgingReservationFormData = {
  providerName: "",
  reservationName: "",
  reservationCode: "",
  address: "",
  city: "",
  country: "",
  checkInDate: "",
  checkInTime: "",
  checkOutDate: "",
  checkOutTime: "",
  guests: "",
  totalAmount: "",
  currency: "EUR",
  paymentStatus: "pending",
  notes: "",
  syncToPlan: true,
  latitude: null,
  longitude: null,
};

function buildFormFromInitial(initialData?: LodgingReservationEditableData | null): LodgingReservationFormData {
  if (!initialData) return EMPTY_FORM;

  return {
    providerName: initialData.providerName || "",
    reservationName: initialData.reservationName || "",
    reservationCode: initialData.reservationCode || "",
    address: initialData.address || "",
    city: initialData.city || "",
    country: initialData.country || "",
    checkInDate: initialData.checkInDate || "",
    checkInTime: initialData.checkInTime || "",
    checkOutDate: initialData.checkOutDate || "",
    checkOutTime: initialData.checkOutTime || "",
    guests: typeof initialData.guests === "number" ? String(initialData.guests) : "",
    totalAmount: typeof initialData.totalAmount === "number" ? String(initialData.totalAmount) : "",
    currency: initialData.currency || "EUR",
    paymentStatus: initialData.paymentStatus || "pending",
    notes: initialData.notes || "",
    syncToPlan: initialData.syncToPlan ?? true,
    latitude: typeof initialData.latitude === "number" ? initialData.latitude : null,
    longitude: typeof initialData.longitude === "number" ? initialData.longitude : null,
  };
}

function normalizePaymentStatus(value: unknown): "paid" | "pending" {
  return value === "paid" ? "paid" : "pending";
}

export default function LodgingReservationForm({
  saving = false,
  detectedData,
  initialData,
  isEditing = false,
  onCancelEdit,
  onSubmit,
}: Props) {
  const [form, setForm] = useState<LodgingReservationFormData>(buildFormFromInitial(initialData));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm(buildFormFromInitial(initialData));
  }, [initialData]);

  useEffect(() => {
    if (!detectedData || isEditing) return;

    setForm((current) => ({
      ...current,
      providerName: detectedData.providerName || current.providerName,
      reservationName: detectedData.reservationName || current.reservationName,
      reservationCode: detectedData.reservationCode || current.reservationCode,
      address: detectedData.address || current.address,
      city: detectedData.city || current.city,
      country: detectedData.country || current.country,
      checkInDate: detectedData.checkInDate || current.checkInDate,
      checkInTime: detectedData.checkInTime || current.checkInTime,
      checkOutDate: detectedData.checkOutDate || current.checkOutDate,
      checkOutTime: detectedData.checkOutTime || current.checkOutTime,
      guests: typeof detectedData.guests === "number" ? String(detectedData.guests) : current.guests,
      totalAmount: typeof detectedData.totalAmount === "number" ? String(detectedData.totalAmount) : current.totalAmount,
      currency: detectedData.currency || current.currency,
      paymentStatus: normalizePaymentStatus(detectedData.paymentStatus || current.paymentStatus),
      notes: current.notes || "",
      latitude: typeof detectedData.latitude === "number" ? detectedData.latitude : current.latitude,
      longitude: typeof detectedData.longitude === "number" ? detectedData.longitude : current.longitude,
    }));
  }, [detectedData, isEditing]);

  function update<K extends keyof LodgingReservationFormData>(key: K, value: LodgingReservationFormData[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleAddressChange(value: string) {
    setForm((current) => ({
      ...current,
      address: value,
      latitude: value === current.address ? current.latitude : null,
      longitude: value === current.address ? current.longitude : null,
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!form.reservationName.trim()) {
      setError("Introduce el nombre del alojamiento.");
      return;
    }

    if (!form.address.trim()) {
      setError("Selecciona el alojamiento con el buscador para guardar bien la ubicación.");
      return;
    }

    if (form.latitude == null || form.longitude == null) {
      setError("Selecciona una sugerencia real del buscador para guardar las coordenadas del alojamiento.");
      return;
    }

    await onSubmit(form);

    if (!isEditing) {
      setForm(EMPTY_FORM);
    }
  }

  return (
    <div className="rounded-2xl border border-violet-200 bg-white p-5 shadow-sm">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
            <span>🏨</span>
            <span>{isEditing ? "Editar alojamiento" : "Alojamiento"}</span>
          </div>
          <h3 className="mt-3 text-lg font-semibold text-slate-900">
            {isEditing ? "Editar alojamiento" : "Plantilla · Alojamiento"}
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Guarda hoteles y alojamientos. Si eliges el lugar desde el autocompletar, se guardarán también las coordenadas para Plan y Rutas.
          </p>
        </div>

        <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={form.syncToPlan}
              onChange={(e) => update("syncToPlan", e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-slate-300"
            />
            <span className="text-sm text-violet-900">
              <span className="font-semibold">Añadir automáticamente al plan y a Rutas</span>
              <span className="block text-violet-700">
                Se creará o actualizará una actividad de tipo alojamiento usando la fecha de entrada y las coordenadas del hotel.
              </span>
            </span>
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Proveedor</span>
            <input value={form.providerName} onChange={(e) => update("providerName", e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3" />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Nombre del alojamiento</span>
            <input value={form.reservationName} onChange={(e) => update("reservationName", e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3" />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Código de reserva</span>
            <input value={form.reservationCode} onChange={(e) => update("reservationCode", e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3" />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Huéspedes</span>
            <input value={form.guests} onChange={(e) => update("guests", e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3" />
          </label>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-semibold text-slate-800">Lugar / dirección del alojamiento</label>
          <PlaceAutocompleteInput
            value={form.address}
            onChange={handleAddressChange}
            onPlaceSelect={(payload) => {
              setForm((current) => ({
                ...current,
                address: payload.address,
                latitude: payload.latitude,
                longitude: payload.longitude,
              }));
            }}
            placeholder="Busca y selecciona el alojamiento"
          />
          <p className="text-xs text-slate-500">
            Escribe la dirección y selecciona una opción del desplegable para guardar las coordenadas.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          Coordenadas:{" "}
          {form.latitude != null && form.longitude != null
            ? `${form.latitude.toFixed(6)}, ${form.longitude.toFixed(6)}`
            : "ninguna todavía"}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Ciudad</span>
            <input value={form.city} onChange={(e) => update("city", e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3" />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">País</span>
            <input value={form.country} onChange={(e) => update("country", e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3" />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Entrada</span>
            <input type="date" value={form.checkInDate} onChange={(e) => update("checkInDate", e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3" />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Hora entrada</span>
            <input type="time" value={form.checkInTime} onChange={(e) => update("checkInTime", e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3" />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Salida</span>
            <input type="date" value={form.checkOutDate} onChange={(e) => update("checkOutDate", e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3" />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Hora salida</span>
            <input type="time" value={form.checkOutTime} onChange={(e) => update("checkOutTime", e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3" />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Importe</span>
            <input value={form.totalAmount} onChange={(e) => update("totalAmount", e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3" />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Moneda</span>
            <input value={form.currency} onChange={(e) => update("currency", e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3" />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Estado de pago</span>
            <select value={form.paymentStatus} onChange={(e) => update("paymentStatus", e.target.value as "paid" | "pending")} className="w-full rounded-xl border border-slate-300 px-4 py-3">
              <option value="pending">Pendiente</option>
              <option value="paid">Pagado</option>
            </select>
          </label>
        </div>

        <label className="space-y-2 block">
          <span className="text-sm font-semibold text-slate-800">Notas</span>
          <textarea value={form.notes} onChange={(e) => update("notes", e.target.value)} rows={4} className="w-full rounded-xl border border-slate-300 px-4 py-3" />
        </label>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={saving} className={`rounded-xl px-4 py-3 text-sm font-semibold ${saving ? "bg-slate-200 text-slate-500" : "bg-violet-600 text-white"}`}>
            {saving ? "Guardando..." : isEditing ? "Guardar cambios" : "Guardar alojamiento"}
          </button>

          {isEditing && onCancelEdit ? (
            <button
              type="button"
              onClick={onCancelEdit}
              className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900"
            >
              Cancelar edición
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
