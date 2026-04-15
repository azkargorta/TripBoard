"use client";

import { FormEvent, useMemo, useState } from "react";
import { useTripInvites } from "@/hooks/useTripInvites";
import type { TripRole, TripParticipant } from "@/hooks/useTripParticipants";
import { useToast } from "@/components/ui/toast";

type InviteParticipantPanelProps = {
  tripId: string;
  participant?: TripParticipant | null;
  onCreated?: () => void;
  onCancel?: () => void;
};

export default function InviteParticipantPanel({
  tripId,
  participant,
  onCreated,
  onCancel,
}: InviteParticipantPanelProps) {
  const { createInvite, buildInviteUrl, loading, error } = useTripInvites();
  const toast = useToast();

  const [displayName, setDisplayName] = useState(participant?.display_name ?? "");
  const [phone, setPhone] = useState(participant?.phone ?? "");
  const [role, setRole] = useState<TripRole>(participant?.role ?? "viewer");
  const [inviteUrl, setInviteUrl] = useState("");
  const [copied, setCopied] = useState(false);

  const title = participant
    ? `Vincular a ${participant.display_name}`
    : "Invitación por WhatsApp";

  const description = participant
    ? "Genera un enlace para que este participante manual se registre o inicie sesión y quede vinculado."
    : "Crea un enlace de invitación y compártelo por WhatsApp.";

  const whatsappHref = useMemo(() => {
    if (!inviteUrl) return "";

    const cleanedPhone = phone.replace(/[^\d]/g, "");
    if (!cleanedPhone) return "";

    const personLabel = displayName.trim() || "Te";
    const text = participant
      ? `Hola ${personLabel}. Te paso tu enlace para unirte al viaje en Kaviro y vincular tu usuario: ${inviteUrl}`
      : `¡Hola! Te invito a unirte a mi viaje en Kaviro. Usa este enlace: ${inviteUrl}`;

    return `https://wa.me/${cleanedPhone}?text=${encodeURIComponent(text)}`;
  }, [phone, inviteUrl, displayName, participant]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCopied(false);

    const invite = await createInvite({
      trip_id: tripId,
      participant_id: participant?.id ?? null,
      display_name: displayName.trim() || null,
      role,
    });

    const url = buildInviteUrl(invite.token);
    setInviteUrl(url);
  }

  async function copyLink() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      toast.success("Enlace copiado", "Ya puedes pegarlo donde quieras.");
    } catch {
      toast.error("No se pudo copiar", "Tu navegador bloqueó el portapapeles. Copia el enlace manualmente.");
    }
  }

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-gray-600">{description}</p>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span>Nombre visible</span>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Ceci"
            className="rounded-lg border px-3 py-2"
          />
        </label>

        <label className="grid gap-1 text-sm">
          <span>Teléfono WhatsApp</span>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="34600111222"
            className="rounded-lg border px-3 py-2"
          />
        </label>

        <label className="grid gap-1 text-sm md:col-span-2">
          <span>Rol inicial</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as TripRole)}
            className="rounded-lg border px-3 py-2"
          >
            <option value="viewer">viewer</option>
            <option value="editor">editor</option>
            <option value="owner">owner</option>
          </select>
        </label>

        <div className="md:col-span-2 flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-black px-4 py-2 text-white disabled:opacity-60"
          >
            {loading ? "Creando..." : participant ? "Crear enlace de vinculación" : "Crear invitación"}
          </button>

          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border px-4 py-2 text-sm"
          >
            Cancelar
          </button>

          {inviteUrl && (
            <>
              <button
                type="button"
                onClick={copyLink}
                className="rounded-lg border px-4 py-2 text-sm"
              >
                {copied ? "Enlace copiado" : "Copiar enlace"}
              </button>

              <a
                href={whatsappHref || "#"}
                target="_blank"
                rel="noreferrer"
                className={`rounded-lg border px-4 py-2 text-sm ${whatsappHref ? "" : "pointer-events-none opacity-50"}`}
              >
                Abrir WhatsApp
              </a>
            </>
          )}
        </div>
      </form>

      {inviteUrl && (
        <div className="mt-4 rounded-lg bg-gray-50 p-3 text-sm break-all">
          {inviteUrl}
        </div>
      )}

      {inviteUrl && onCreated && (
        <div className="mt-3">
          <button
            type="button"
            onClick={onCreated}
            className="rounded-lg border px-4 py-2 text-sm"
          >
            Cerrar panel
          </button>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}
