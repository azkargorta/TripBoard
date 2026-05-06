"use client";

import { FormEvent, useMemo, useState } from "react";
import { useTripInvites } from "@/hooks/useTripInvites";
import type { TripRole, TripParticipant } from "@/hooks/useTripParticipants";
import { useToast } from "@/components/ui/toast";
import { btnPrimary } from "@/components/ui/brandStyles";
import { Link2, MessageCircle, Copy, Check, X, UserPlus2 } from "lucide-react";

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
    <div className={`overflow-hidden rounded-2xl border shadow-sm ${participant ? "border-violet-200 bg-white" : "border-emerald-300 bg-gradient-to-br from-emerald-50 to-white"}`}>
      {/* Ge4 — WhatsApp header strip */}
      <div className={`flex items-start gap-3 px-5 py-4 ${participant ? "border-b border-violet-100 bg-violet-50/60" : "border-b border-emerald-200/60 bg-emerald-500"}`}>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${participant ? "bg-violet-100 text-violet-700" : "bg-white/30 text-white"}`}>
          {participant ? <Link2 className="h-5 w-5" aria-hidden /> : <MessageCircle className="h-5 w-5" aria-hidden />}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className={`text-sm font-extrabold ${participant ? "text-violet-950" : "text-white"}`}>{title}</h2>
          <p className={`mt-0.5 text-xs font-semibold ${participant ? "text-violet-700" : "text-emerald-100"}`}>{description}</p>
        </div>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            aria-label="Cerrar"
            title="Cerrar"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        ) : null}
      </div>

      <form onSubmit={handleSubmit} className="mt-4 grid gap-3">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
            <span>Nombre visible</span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Ej. Ceci"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-200"
            />
          </label>

          <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
            <span>Teléfono WhatsApp</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Ej. 34600111222"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-200"
            />
          </label>
        </div>

        <label className="grid gap-1.5 text-xs font-semibold text-slate-600">
          <span>Rol inicial</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as TripRole)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-200"
          >
            <option value="viewer">Lector</option>
            <option value="editor">Editor</option>
            <option value="owner">Owner</option>
          </select>
        </label>

        <div className="mt-1 flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={loading}
            className={`${btnPrimary} inline-flex items-center gap-2 px-4 py-2.5 text-sm disabled:opacity-60`}
          >
            {participant ? <Link2 className="h-4 w-4" aria-hidden /> : <UserPlus2 className="h-4 w-4" aria-hidden />}
            {loading ? "Creando…" : participant ? "Crear enlace de vinculación" : "Crear invitación"}
          </button>

          {inviteUrl ? (
            <>
              <button
                type="button"
                onClick={copyLink}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-600" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                {copied ? "Copiado" : "Copiar enlace"}
              </button>
              <a
                href={whatsappHref || "#"}
                target="_blank"
                rel="noreferrer"
                className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
                  whatsappHref
                    ? "border-emerald-500 bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm"
                    : "pointer-events-none border-slate-200 bg-white text-slate-400 opacity-60"
                }`}
              >
                <MessageCircle className="h-4 w-4" aria-hidden />
                Abrir WhatsApp
              </a>
            </>
          ) : null}
        </div>

        {inviteUrl ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 break-all">
            {inviteUrl}
          </div>
        ) : null}

        {inviteUrl && onCreated ? (
          <button
            type="button"
            onClick={onCreated}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            <Check className="h-4 w-4" aria-hidden />
            Listo
          </button>
        ) : null}
      </form>

      {error ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {error}
        </div>
      ) : null}
    </div>
  );
}
