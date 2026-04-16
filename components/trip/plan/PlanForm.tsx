
"use client";

import { useEffect, useState } from "react";
import PlaceAutocompleteInput from "@/components/PlaceAutocompleteInput";
import { Check, Star, X } from "lucide-react";

export type ActivityKind =
  | "visit"
  | "museum"
  | "restaurant"
  | "lodging"
  | "transport"
  | "activity"
  | string;

export type PlanFormValues = {
  title: string;
  description: string;
  rating: number;
  comment: string;
  activityDate: string;
  activityTime: string;
  placeName: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  activityKind: ActivityKind;
};

type EditableActivity = {
  id?: string;
  title?: string | null;
  description?: string | null;
  rating?: number | null;
  comment?: string | null;
  activity_date?: string | null;
  activity_time?: string | null;
  place_name?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  activity_kind?: string | null;
};

type Props = {
  saving?: boolean;
  initialData?: EditableActivity | null;
  onCancelEdit?: () => void;
  onSubmit: (values: PlanFormValues) => Promise<void>;
  premiumEnabled: boolean;
  availableKinds?: string[];
};

const EMPTY_FORM: PlanFormValues = {
  title: "",
  description: "",
  rating: 0,
  comment: "",
  activityDate: "",
  activityTime: "",
  placeName: "",
  address: "",
  latitude: null,
  longitude: null,
  activityKind: "visit",
};

function fromInitial(initialData?: EditableActivity | null): PlanFormValues {
  if (!initialData) return EMPTY_FORM;
  return {
    title: initialData.title || "",
    description: initialData.description || "",
    rating: typeof initialData.rating === "number" && initialData.rating >= 1 && initialData.rating <= 5 ? initialData.rating : 0,
    comment: initialData.comment || "",
    activityDate: initialData.activity_date || "",
    activityTime: initialData.activity_time || "",
    placeName: initialData.place_name || "",
    address: initialData.address || "",
    latitude: typeof initialData.latitude === "number" ? initialData.latitude : null,
    longitude: typeof initialData.longitude === "number" ? initialData.longitude : null,
    activityKind:
      (typeof initialData.activity_kind === "string" && initialData.activity_kind.trim()) ? initialData.activity_kind.trim() : "visit",
  };
}

function normalizeKind(kind: unknown) {
  return typeof kind === "string" ? kind.trim().toLowerCase() : "";
}

function toLabel(kindRaw: string) {
  const k = normalizeKind(kindRaw);
  if (k === "visit") return "Visita";
  if (k === "museum") return "Museo";
  if (k === "restaurant") return "Restaurante";
  if (k === "transport") return "Transporte";
  if (k === "activity") return "Actividad";
  if (k === "lodging") return "Alojamiento";
  // Custom: capitaliza primera letra
  return kindRaw.trim().slice(0, 1).toUpperCase() + kindRaw.trim().slice(1);
}

export default function PlanForm({
  saving = false,
  initialData,
  onCancelEdit,
  onSubmit,
  premiumEnabled,
  availableKinds = [],
}: Props) {
  const [form, setForm] = useState<PlanFormValues>(fromInitial(initialData));
  const [error, setError] = useState<string | null>(null);
  const isEditing = Boolean(initialData?.id);
  const [customKind, setCustomKind] = useState<string>("");
  const [kindMode, setKindMode] = useState<"select" | "custom">("select");

  useEffect(() => {
    setForm(fromInitial(initialData));
    setCustomKind("");
    setKindMode("select");
  }, [initialData]);

  function update<K extends keyof PlanFormValues>(key: K, value: PlanFormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleFormKeyDown(event: React.KeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Enter") return;

    const target = event.target as HTMLElement | null;
    const tagName = target?.tagName?.toLowerCase();

    if (tagName === "textarea") return;

    event.preventDefault();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!form.title.trim()) {
      setError("Introduce un título para el plan.");
      return;
    }

    const nextKind =
      kindMode === "custom"
        ? customKind.trim()
        : typeof form.activityKind === "string"
          ? form.activityKind.trim()
          : String(form.activityKind || "").trim();

    if (!nextKind) {
      setError("Selecciona un tipo de actividad (o escribe uno personalizado).");
      return;
    }

    await onSubmit({ ...form, activityKind: nextKind });

    if (!isEditing) {
      setForm(EMPTY_FORM);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              <span>🗓️</span>
              <span>{isEditing ? "Editar plan" : "Nuevo plan"}</span>
            </div>

            <h3 className="mt-3 text-lg font-semibold text-slate-900">
              {isEditing ? "Editar actividad del plan" : "Añadir actividad al plan"}
            </h3>

            <p className="mt-1 text-sm text-slate-500">
              Crea visitas, museos, restaurantes, transportes o actividades manuales. Los alojamientos vienen automáticamente desde Reservas.
            </p>
          </div>

          {onCancelEdit ? (
            <button
              type="button"
              onClick={onCancelEdit}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-200"
            >
              <X className="h-4 w-4" />
              {isEditing ? "Cancelar edición" : "Cerrar"}
            </button>
          ) : null}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-semibold text-slate-800">Título</span>
            <input
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Tipo de actividad</span>
            <div className="space-y-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setKindMode("select")}
                  className={`flex-1 rounded-xl border px-3 py-2 text-xs font-extrabold transition focus:outline-none focus:ring-2 focus:ring-violet-200 ${
                    kindMode === "select"
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Lista
                </button>
                <button
                  type="button"
                  onClick={() => setKindMode("custom")}
                  className={`flex-1 rounded-xl border px-3 py-2 text-xs font-extrabold transition focus:outline-none focus:ring-2 focus:ring-violet-200 ${
                    kindMode === "custom"
                      ? "border-violet-300 bg-violet-50 text-violet-900"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  Personalizado
                </button>
              </div>

              {kindMode === "select" ? (
                <select
                  value={typeof form.activityKind === "string" ? form.activityKind : "visit"}
                  onChange={(e) => update("activityKind", e.target.value as ActivityKind)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
                >
                  {[
                    "visit",
                    "museum",
                    "restaurant",
                    "transport",
                    "activity",
                    "lodging",
                    ...availableKinds.filter((k) => {
                      const nk = normalizeKind(k);
                      return nk && !["visit", "museum", "restaurant", "transport", "activity", "lodging"].includes(nk);
                    }),
                  ]
                    .map((k) => String(k))
                    .filter(Boolean)
                    .map((k) => (
                      <option key={k} value={k}>
                        {toLabel(k)}
                      </option>
                    ))}
                </select>
              ) : (
                <input
                  value={customKind}
                  onChange={(e) => setCustomKind(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
                  placeholder="Ej. Playa, Senderismo, Compras…"
                />
              )}
            </div>
          </label>
        </div>

        <label className="space-y-2">
          <span className="text-sm font-semibold text-slate-800">Lugar visible</span>
          <input
            value={form.placeName}
            onChange={(e) => update("placeName", e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
          />
        </label>

        {premiumEnabled ? (
          <PlaceAutocompleteInput
            label="Lugar / dirección"
            value={form.address}
            onChange={(value) => update("address", value)}
            onPlaceSelect={({ address, latitude, longitude }) => {
              setForm((current) => ({
                ...current,
                address,
                latitude,
                longitude,
                placeName: current.placeName || address,
              }));
            }}
          />
        ) : (
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Dirección (manual)</span>
            <input
              value={form.address}
              onChange={(e) => {
                update("address", e.target.value);
                update("latitude", null);
                update("longitude", null);
              }}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
              placeholder="Ej. Calle Mayor 1, Madrid"
            />
            <p className="text-xs text-slate-500">Autocompletar y coordenadas solo en Premium.</p>
          </label>
        )}

        {premiumEnabled ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            Coordenadas:{" "}
            {form.latitude != null && form.longitude != null
              ? `${form.latitude.toFixed(6)}, ${form.longitude.toFixed(6)}`
              : "ninguna todavía"}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Fecha</span>
            <input
              type="date"
              value={form.activityDate}
              onChange={(e) => update("activityDate", e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Hora</span>
            <input
              type="time"
              value={form.activityTime}
              onChange={(e) => update("activityTime", e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
            />
          </label>
        </div>

        <label className="block space-y-2">
          <span className="text-sm font-semibold text-slate-800">Descripción</span>
          <textarea
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            rows={4}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
          />
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Valoración</span>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => {
                const active = form.rating >= n;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => update("rating", form.rating === n ? 0 : n)}
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border transition focus:outline-none focus:ring-2 focus:ring-violet-200 ${
                      active ? "border-amber-200 bg-amber-50 text-amber-600" : "border-slate-200 bg-white text-slate-400 hover:bg-slate-50"
                    }`}
                    aria-label={`Valorar con ${n} estrellas`}
                    title={`${n} estrellas`}
                  >
                    <Star className={`h-5 w-5 ${active ? "fill-current" : ""}`} aria-hidden />
                  </button>
                );
              })}
              {form.rating ? (
                <button
                  type="button"
                  onClick={() => update("rating", 0)}
                  className="ml-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-200"
                >
                  Quitar
                </button>
              ) : null}
            </div>
          </div>

          <label className="block space-y-2">
            <span className="text-sm font-semibold text-slate-800">Comentarios</span>
            <textarea
              value={form.comment}
              onChange={(e) => update("comment", e.target.value)}
              rows={3}
              placeholder="Qué te ha parecido, consejos, cosas a recordar…"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
            />
          </label>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={saving}
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-violet-200 ${
              saving ? "bg-slate-200 text-slate-500" : "bg-slate-950 text-white hover:bg-slate-800"
            }`}
          >
            <Check className="h-4 w-4" />
            {saving ? "Guardando..." : isEditing ? "Guardar cambios" : "Guardar actividad"}
          </button>

          {isEditing && onCancelEdit ? (
            <button
              type="button"
              onClick={onCancelEdit}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-violet-200"
            >
              <X className="h-4 w-4" />
              Cancelar
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
