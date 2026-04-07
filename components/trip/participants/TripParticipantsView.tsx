"use client";

import { useEffect, useMemo, useState } from "react";
import ParticipantForm from "./ParticipantForm";
import InviteParticipantPanel from "./InviteParticipantPanel";
import TripScreenActions from "@/components/trip/common/TripScreenActions";
import {
  useTripParticipants,
  type TripParticipant,
  type TripRole,
} from "@/hooks/useTripParticipants";
import { supabase } from "@/lib/supabase";
import ParticipantLinkProfilePanel from "./ParticipantLinkProfilePanel";

type TripParticipantsViewProps = {
  tripId: string;
};

export default function TripParticipantsView({
  tripId,
}: TripParticipantsViewProps) {
  const {
    participants,
    loading,
    error,
    addParticipant,
    updateParticipant,
    removeParticipant,
    searchProfiles,
    linkParticipantToProfile,
    refetch,
  } = useTripParticipants(tripId);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isLoadedUser, setIsLoadedUser] = useState(false);

  const [isCreating, setIsCreating] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [inviteParticipant, setInviteParticipant] =
    useState<TripParticipant | null>(null);
  const [editingParticipant, setEditingParticipant] =
    useState<TripParticipant | null>(null);
  const [linkingParticipant, setLinkingParticipant] =
    useState<TripParticipant | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (isLoadedUser) return;

    supabase.auth.getSession().then(({ data }) => {
      setCurrentUserId(data.session?.user?.id ?? null);
      setIsLoadedUser(true);
    });
  }, [isLoadedUser]);

  useEffect(() => {
    if (!linkingParticipant) return;
    const row = participants.find((p) => p.id === linkingParticipant.id);
    if (row?.user_id) setLinkingParticipant(null);
  }, [linkingParticipant, participants]);

  const sortedParticipants = useMemo(() => {
    return [...participants].sort((a, b) =>
      a.display_name.localeCompare(b.display_name, "es")
    );
  }, [participants]);

  const myParticipant = useMemo(() => {
    if (!currentUserId) return null;
    return participants.find((p) => p.user_id === currentUserId) ?? null;
  }, [participants, currentUserId]);

  const canManageParticipants = Boolean(
    myParticipant?.role === "owner" || myParticipant?.can_manage_participants
  );

  async function handleCreate(input: {
    trip_id: string;
    display_name?: string;
    username?: string | null;
    phone?: string | null;
    joined_via?: string | null;
    role?: TripRole;
  }) {
    setActionError(null);

    await addParticipant({
      trip_id: input.trip_id,
      display_name: input.display_name || "",
      username: input.username ?? null,
      phone: input.phone ?? null,
      joined_via: input.joined_via ?? "manual",
      user_id: null,
      role: input.role ?? "viewer",
    });

    setIsCreating(false);
  }

  async function handleUpdate(input: {
    trip_id: string;
    display_name?: string;
    username?: string | null;
    phone?: string | null;
    joined_via?: string | null;
    role?: TripRole;
  }) {
    if (!editingParticipant) return;

    setActionError(null);

    await updateParticipant(editingParticipant.id, {
      display_name: input.display_name,
      username: input.username ?? null,
      phone: input.phone ?? null,
      joined_via: input.joined_via ?? null,
      role: input.role,
    });

    setEditingParticipant(null);
  }

  async function handleRemove(id: string) {
    const confirmed = window.confirm(
      "¿Seguro que quieres eliminar este participante?"
    );

    if (!confirmed) return;

    try {
      setActionError(null);
      await removeParticipant(id);

      if (editingParticipant?.id === id) {
        setEditingParticipant(null);
      }

      if (inviteParticipant?.id === id) {
        setInviteParticipant(null);
        setIsInviting(false);
      }
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "No se pudo eliminar"
      );
    }
  }

  function openGenericInvite() {
    setEditingParticipant(null);
    setLinkingParticipant(null);
    setIsCreating(false);
    setInviteParticipant(null);
    setIsInviting((prev) => !prev);
  }

  function openParticipantInvite(participant: TripParticipant) {
    setEditingParticipant(null);
    setLinkingParticipant(null);
    setIsCreating(false);
    setInviteParticipant(participant);
    setIsInviting(true);
  }

  function openLinkProfile(participant: TripParticipant) {
    setInviteParticipant(null);
    setIsInviting(false);
    setIsCreating(false);
    setEditingParticipant(null);
    setLinkingParticipant((prev) => (prev?.id === participant.id ? null : participant));
  }

  if (loading) {
    return <div className="p-4">Cargando participantes...</div>;
  }

  if (error) {
    return (
      <div className="space-y-4 p-4">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50"
        >
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            Participantes
          </div>
          <h1 className="mt-3 text-3xl font-bold text-slate-900">Participantes</h1>
          <p className="text-sm text-gray-600">Gestiona las personas de este viaje.</p>
        </div>

        <TripScreenActions tripId={tripId} />
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-end">
        {canManageParticipants && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                setEditingParticipant(null);
                setInviteParticipant(null);
                setIsInviting(false);
                setIsCreating((prev) => !prev);
              }}
              className="rounded-lg bg-black px-4 py-2 text-white"
            >
              {isCreating ? "Cerrar formulario" : "Añadir participante"}
            </button>

            <button
              onClick={openGenericInvite}
              className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50"
            >
              {isInviting && !inviteParticipant
                ? "Cerrar invitación"
                : "Invitar por WhatsApp"}
            </button>
          </div>
        )}
      </div>

      {actionError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </div>
      )}

      {!canManageParticipants && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          Solo quien tenga permiso de gestionar participantes (owner o permiso explícito) puede editar esta lista.
        </div>
      )}

      {canManageParticipants && isInviting && (
        <InviteParticipantPanel
          tripId={tripId}
          participant={inviteParticipant}
          onCreated={() => {
            setIsInviting(false);
            setInviteParticipant(null);
          }}
          onCancel={() => {
            setIsInviting(false);
            setInviteParticipant(null);
          }}
        />
      )}

      {canManageParticipants && isCreating && (
        <ParticipantForm
          tripId={tripId}
          onSubmit={handleCreate}
          onCancel={() => setIsCreating(false)}
          submitLabel="Añadir participante"
        />
      )}

      {canManageParticipants && editingParticipant && (
        <ParticipantForm
          tripId={tripId}
          initialData={editingParticipant}
          onSubmit={handleUpdate}
          onCancel={() => setEditingParticipant(null)}
          submitLabel="Guardar cambios"
        />
      )}

      {canManageParticipants && linkingParticipant && (
        <ParticipantLinkProfilePanel
          participant={linkingParticipant}
          onSearchProfiles={searchProfiles}
          onLinkProfile={async (profile) => {
            setActionError(null);
            try {
              await linkParticipantToProfile(linkingParticipant.id, profile);
              setLinkingParticipant(null);
            } catch (e) {
              setActionError(e instanceof Error ? e.message : "No se pudo vincular el usuario.");
            }
          }}
        />
      )}

      {sortedParticipants.length === 0 ? (
        <div className="rounded-xl border bg-white p-4 text-sm text-gray-600">
          No hay participantes todavía.
        </div>
      ) : (
        <div className="grid gap-4">
          {sortedParticipants.map((participant) => {
            const isLinkedUser = Boolean(participant.user_id);
            const canInviteThisParticipant = !isLinkedUser;

            return (
              <article
                key={participant.id}
                className="rounded-xl border bg-white p-4 shadow-sm"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold">
                        {participant.display_name}
                      </h3>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                        {participant.role}
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                        {participant.status}
                      </span>
                    </div>

                    <div className="space-y-1 text-sm text-gray-600">
                      {participant.username ? <p>@{participant.username}</p> : null}
                      {participant.email ? <p>{participant.email}</p> : null}
                      {participant.phone ? <p>{participant.phone}</p> : null}
                      {participant.joined_via ? (
                        <p>Vía: {participant.joined_via}</p>
                      ) : null}
                    </div>
                  </div>

                  {canManageParticipants && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setEditingParticipant(participant)}
                        className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
                      >
                        Editar
                      </button>

                      {canInviteThisParticipant && (
                        <button
                          onClick={() => openParticipantInvite(participant)}
                          className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
                        >
                          Invitar (WhatsApp)
                        </button>
                      )}

                      {canInviteThisParticipant && (
                        <button
                          onClick={() => openLinkProfile(participant)}
                          className="rounded-lg border px-3 py-2 text-sm hover:bg-gray-50"
                        >
                          Vincular usuario
                        </button>
                      )}

                      <button
                        onClick={() => void handleRemove(participant.id)}
                        className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                      >
                        Eliminar
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
