"use client";

import { useEffect, useState } from "react";
import type { TripParticipant } from "@/hooks/useTripParticipants";
import {
  getDefaultPermissionsByRole,
  PARTICIPANT_STATUS_OPTIONS,
  TRIP_ROLE_OPTIONS,
  type ParticipantStatus,
  type TripRole,
} from "@/lib/participants";

type ParticipantFormValues = {
  trip_id: string;
  display_name?: string;
  username?: string | null;
  email?: string | null;
  phone?: string | null;
  joined_via?: string | null;
  role?: TripRole;
  status?: ParticipantStatus;
  can_manage_trip?: boolean;
  can_manage_participants?: boolean;
  can_manage_expenses?: boolean;
  can_manage_plan?: boolean;
  can_manage_map?: boolean;
  can_manage_resources?: boolean;
};

type Props = {
  tripId: string;
  initialData?: TripParticipant | null;
  onSubmit: (values: ParticipantFormValues) => Promise<void>;
  onCancel: () => void;
  submitLabel?: string;
};

export default function ParticipantForm({
  tripId,
  initialData,
  onSubmit,
  onCancel,
  submitLabel = "Guardar",
}: Props) {
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [joinedVia, setJoinedVia] = useState("manual");
  const [role, setRole] = useState<TripRole>("viewer");
  const [status, setStatus] = useState<ParticipantStatus>("active");
  const [canManageTrip, setCanManageTrip] = useState(false);
  const [canManageParticipants, setCanManageParticipants] = useState(false);
  const [canManageExpenses, setCanManageExpenses] = useState(false);
  const [canManagePlan, setCanManagePlan] = useState(false);
  const [canManageMap, setCanManageMap] = useState(false);
  const [canManageResources, setCanManageResources] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const nextRole = initialData?.role ?? "viewer";
    const defaults = getDefaultPermissionsByRole(nextRole);

    setDisplayName(initialData?.display_name ?? "");
    setUsername(initialData?.username ?? "");
    setEmail(initialData?.email ?? "");
    setPhone(initialData?.phone ?? "");
    setJoinedVia(initialData?.joined_via ?? "manual");
    setRole(nextRole);
    setStatus(initialData?.status ?? (initialData?.user_id ? "active" : "pending"));
    setCanManageTrip(initialData?.can_manage_trip ?? defaults.can_manage_trip);
    setCanManageParticipants(
      initialData?.can_manage_participants ?? defaults.can_manage_participants
    );
    setCanManageExpenses(
      initialData?.can_manage_expenses ?? defaults.can_manage_expenses
    );
    setCanManagePlan(initialData?.can_manage_plan ?? defaults.can_manage_plan);
    setCanManageMap(initialData?.can_manage_map ?? defaults.can_manage_map);
    setCanManageResources(
      initialData?.can_manage_resources ?? defaults.can_manage_resources
    );
  }, [initialData]);

  function applyRole(nextRole: TripRole) {
    setRole(nextRole);
    const defaults = getDefaultPermissionsByRole(nextRole);
    setCanManageTrip(defaults.can_manage_trip);
    setCanManageParticipants(defaults.can_manage_participants);
    setCanManageExpenses(defaults.can_manage_expenses);
    setCanManagePlan(defaults.can_manage_plan);
    setCanManageMap(defaults.can_manage_map);
    setCanManageResources(defaults.can_manage_resources);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!displayName.trim()) {
      setError("El nombre visible es obligatorio.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await onSubmit({
        trip_id: tripId,
        display_name: displayName.trim(),
        username: username.trim() || null,
        email: email.trim().toLowerCase() || null,
        phone: phone.trim() || null,
        joined_via: joinedVia || null,
        role,
        status,
        can_manage_trip: canManageTrip,
        can_manage_participants: canManageParticipants,
        can_manage_expenses: canManageExpenses,
        can_manage_plan: canManagePlan,
        can_manage_map: canManageMap,
        can_manage_resources: canManageResources,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el participante.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">
            {initialData ? "Editar participante" : "Añadir participante"}
          </h3>
          <p className="text-sm text-gray-500">
            Rol principal + permisos granulares reales.
          </p>
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Nombre visible">
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className="w-full rounded-xl border px-3 py-2"
            placeholder="Ej. Ceci"
          />
        </Field>

        <Field label="Username">
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="w-full rounded-xl border px-3 py-2"
            placeholder="opcional"
          />
        </Field>

        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-xl border px-3 py-2"
            placeholder="persona@email.com"
          />
        </Field>

        <Field label="Teléfono">
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className="w-full rounded-xl border px-3 py-2"
            placeholder="+34..."
          />
        </Field>

        <Field label="Añadido vía">
          <select
            value={joinedVia}
            onChange={(event) => setJoinedVia(event.target.value)}
            className="w-full rounded-xl border px-3 py-2"
          >
            <option value="manual">manual</option>
            <option value="owner">owner</option>
            <option value="invite">invite</option>
            <option value="whatsapp">whatsapp</option>
            <option value="linked">linked</option>
          </select>
        </Field>

        <Field label="Rol">
          <select
            value={role}
            onChange={(event) => applyRole(event.target.value as TripRole)}
            className="w-full rounded-xl border px-3 py-2"
          >
            {TRIP_ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        <div className="md:col-span-2">
          <Field label="Estado">
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as ParticipantStatus)}
              className="w-full rounded-xl border px-3 py-2"
            >
              {PARTICIPANT_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border bg-gray-50 p-4">
        <h4 className="mb-3 font-semibold">Permisos granulares</h4>
        <div className="grid gap-3 md:grid-cols-2">
          <PermissionCheckbox label="Gestionar viaje" checked={canManageTrip} onChange={setCanManageTrip} />
          <PermissionCheckbox label="Gestionar participantes" checked={canManageParticipants} onChange={setCanManageParticipants} />
          <PermissionCheckbox label="Gestionar gastos" checked={canManageExpenses} onChange={setCanManageExpenses} />
          <PermissionCheckbox label="Gestionar plan" checked={canManagePlan} onChange={setCanManagePlan} />
          <PermissionCheckbox label="Gestionar mapa" checked={canManageMap} onChange={setCanManageMap} />
          <PermissionCheckbox label="Gestionar recursos" checked={canManageResources} onChange={setCanManageResources} />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-black px-4 py-2 text-white disabled:opacity-60"
        >
          {saving ? "Guardando..." : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border px-4 py-2"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      {children}
    </label>
  );
}

function PermissionCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm">
      <input type="checkbox" checked={checked} onChange={() => onChange(!checked)} />
      {label}
    </label>
  );
}
