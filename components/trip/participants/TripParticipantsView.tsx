"use client";

import { useEffect, useMemo, useState } from "react";
import ParticipantForm from "./ParticipantForm";
import InviteParticipantPanel from "./InviteParticipantPanel";
import TripScreenActions from "@/components/trip/common/TripScreenActions";
import TripTabActions from "@/components/trip/common/TripTabActions";
import {
  useTripParticipants,
  type TripParticipant,
  type TripRole,
} from "@/hooks/useTripParticipants";
import { supabase } from "@/lib/supabase";
import ParticipantLinkProfilePanel from "./ParticipantLinkProfilePanel";
import TripBoardPageHeader from "@/components/layout/TripBoardPageHeader";
import LongTextSheet from "@/components/ui/LongTextSheet";
import { getRoleLabel, getStatusLabel } from "@/lib/participants";
import {
  Info,
  Link2,
  MessageCircle,
  Pencil,
  RefreshCcw,
  Search,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  UserCheck,
} from "lucide-react";

type TripParticipantsViewProps = {
  tripId: string;
  /** Rutas bajo `/trip/[id]/map/*`: pestañas del flujo «Rutas» en lugar de acciones de pantalla completa */
  mapFlow?: boolean;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1 && parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0]?.[0] || "?").toUpperCase();
}

function roleStyle(role: string) {
  if (role === "owner") return "bg-violet-100 text-violet-800 border-violet-200";
  if (role === "editor") return "bg-sky-100 text-sky-800 border-sky-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

export default function TripParticipantsView({ tripId, mapFlow = false }: TripParticipantsViewProps) {
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
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [isLoadedUser, setIsLoadedUser] = useState(false);
  const [serverCanManageParticipants, setServerCanManageParticipants] = useState<boolean | null>(null);
  const [serverAccessLoaded, setServerAccessLoaded] = useState(false);

  const [isCreating, setIsCreating] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [inviteParticipant, setInviteParticipant] = useState<TripParticipant | null>(null);
  const [editingParticipant, setEditingParticipant] = useState<TripParticipant | null>(null);
  const [linkingParticipant, setLinkingParticipant] = useState<TripParticipant | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [linkFilter, setLinkFilter] = useState<"all" | "linked" | "unlinked">("all");
  const [roleFilter, setRoleFilter] = useState<"all" | TripRole>("all");

  useEffect(() => {
    if (isLoadedUser) return;
    supabase.auth.getSession().then(({ data }) => {
      setCurrentUserId(data.session?.user?.id ?? null);
      setCurrentUserEmail((data.session?.user?.email ?? null)?.toLowerCase() ?? null);
      setIsLoadedUser(true);
    });
  }, [isLoadedUser]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/trip-access?tripId=${encodeURIComponent(tripId)}`)
      .then((r) => r.json())
      .then((payload) => {
        if (cancelled) return;
        const can = Boolean(payload?.access?.canManageParticipants);
        setServerCanManageParticipants(can);
        setServerAccessLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setServerCanManageParticipants(null);
        setServerAccessLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  useEffect(() => {
    if (!linkingParticipant) return;
    const row = participants.find((p) => p.id === linkingParticipant.id);
    if (row?.user_id) setLinkingParticipant(null);
  }, [linkingParticipant, participants]);

  const sortedParticipants = useMemo(() => {
    return [...participants].sort((a, b) => a.display_name.localeCompare(b.display_name, "es"));
  }, [participants]);

  const myParticipant = useMemo(() => {
    if (!participants.length) return null;

    if (currentUserId) {
      const byUserId = participants.find((p) => p.user_id === currentUserId) ?? null;
      if (byUserId) return byUserId;
    }

    if (currentUserEmail) {
      const byEmail =
        participants.find((p) => (p.email ? String(p.email).toLowerCase() : "") === currentUserEmail) ?? null;
      if (byEmail) return byEmail;
    }

    return null;
  }, [participants, currentUserId, currentUserEmail]);

  const canManageParticipants = Boolean(
    serverAccessLoaded
      ? serverCanManageParticipants
      : myParticipant?.role === "owner" || myParticipant?.can_manage_participants
  );

  const stats = useMemo(() => {
    const total = participants.length;
    const linked = participants.filter((p) => Boolean(p.user_id)).length;
    const unlinked = total - linked;
    return { total, linked, unlinked };
  }, [participants]);

  const filteredParticipants = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sortedParticipants.filter((p) => {
      if (roleFilter !== "all" && p.role !== roleFilter) return false;
      if (linkFilter === "linked" && !p.user_id) return false;
      if (linkFilter === "unlinked" && p.user_id) return false;
      if (!q) return true;
      const hay = [
        p.display_name,
        p.username,
        p.email,
        p.phone,
        p.joined_via,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [sortedParticipants, query, linkFilter, roleFilter]);

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
    const confirmed = window.confirm("¿Seguro que quieres eliminar este participante?");
    if (!confirmed) return;
    try {
      setActionError(null);
      await removeParticipant(id);
      if (editingParticipant?.id === id) setEditingParticipant(null);
      if (inviteParticipant?.id === id) {
        setInviteParticipant(null);
        setIsInviting(false);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "No se pudo eliminar");
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
    return (
      <main className="space-y-6">
        <div className="h-40 animate-pulse rounded-3xl bg-gradient-to-r from-slate-200 via-slate-100 to-violet-100" />
        <div className="grid gap-3 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="space-y-4">
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        <button
          type="button"
          onClick={() => void refetch()}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          Reintentar
        </button>
      </main>
    );
  }

  return (
    <main className="min-w-0 max-w-full space-y-8 overflow-x-hidden">
      <TripBoardPageHeader
        section="Pasajeros del viaje"
        title="Participantes"
        description="Añade compañeros, envía invitaciones por WhatsApp para que vinculen su cuenta y evita duplicados buscando su perfil."
        iconSrc="/brand/tabs/participants.png"
        iconAlt="Participantes"
        actions={mapFlow ? <TripTabActions tripId={tripId} /> : <TripScreenActions tripId={tripId} />}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Total</p>
          <p className="mt-1 text-2xl font-black text-slate-950">{stats.total}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Con cuenta</p>
          <p className="mt-1 flex items-center gap-2 text-2xl font-black text-slate-950">
            <UserCheck className="h-6 w-6 text-emerald-600" aria-hidden />
            {stats.linked}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Pendientes de vincular</p>
          <p className="mt-1 flex items-center gap-2 text-2xl font-black text-slate-950">
            <Sparkles className="h-6 w-6 text-amber-500" aria-hidden />
            {stats.unlinked}
          </p>
        </div>
      </div>

      {actionError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{actionError}</div>
      ) : null}

      {serverAccessLoaded && !canManageParticipants ? (
        <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white px-5 py-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-800">
              <Info className="h-5 w-5" aria-hidden />
            </div>
            <div className="space-y-1">
              <p className="font-semibold text-amber-950">Vista de solo lectura</p>
              <p className="text-sm text-amber-900/80">
                Solo el <span className="font-semibold">owner</span> o quien tenga permiso explícito de{" "}
                <span className="font-semibold">gestionar participantes</span> puede añadir, editar o invitar. Si
                necesitas cambios, pídeselo a quien administra el viaje.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <section className="min-w-0 space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h2 className="text-lg font-bold text-slate-900">Lista de pasajeros</h2>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nombre, @usuario, email o teléfono…"
                className="min-w-0 max-w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 shadow-sm outline-none ring-violet-200 transition focus:border-violet-300 focus:ring-2"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {(
            [
              { id: "all" as const, label: "Todos" },
              { id: "linked" as const, label: "Con cuenta" },
              { id: "unlinked" as const, label: "Sin vincular" },
            ] as const
          ).map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => setLinkFilter(chip.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                linkFilter === chip.id
                  ? "border-violet-300 bg-violet-50 text-violet-900"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {chip.label}
            </button>
          ))}
          <span className="mx-1 hidden h-6 w-px bg-slate-200 sm:inline-block" aria-hidden />
          {(
            [
              { id: "all" as const, label: "Todos los roles" },
              { id: "owner" as const, label: "Owner" },
              { id: "editor" as const, label: "Editor" },
              { id: "viewer" as const, label: "Lector" },
            ] as const
          ).map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => setRoleFilter(chip.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                roleFilter === chip.id
                  ? "border-sky-300 bg-sky-50 text-sky-900"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>

        {sortedParticipants.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 px-6 py-12 text-center">
            <Users className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-base font-semibold text-slate-800">Aún no hay pasajeros</p>
            <p className="mt-1 text-sm text-slate-500">
              Cuando tengas permiso de gestión, podrás añadir manualmente o enviar una invitación por WhatsApp.
            </p>
          </div>
        ) : filteredParticipants.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-600">
            No hay resultados con estos filtros. Prueba a limpiar la búsqueda o cambiar el filtro de vinculación.
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredParticipants.map((participant) => {
              const isLinkedUser = Boolean(participant.user_id);
              const canInviteThisParticipant = !isLinkedUser;
              const isYou = Boolean(currentUserId && participant.user_id === currentUserId);

              return (
                <article
                  key={participant.id}
                  className={`group rounded-3xl border bg-white p-5 shadow-sm transition hover:shadow-md ${
                    isYou ? "border-violet-200 ring-1 ring-violet-100" : "border-slate-200"
                  }`}
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="flex min-w-0 flex-1 gap-4">
                      <div
                        className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-lg font-black text-white shadow-inner ${
                          participant.role === "owner"
                            ? "bg-gradient-to-br from-violet-600 to-indigo-700"
                            : participant.role === "editor"
                              ? "bg-gradient-to-br from-sky-500 to-cyan-600"
                              : "bg-gradient-to-br from-slate-500 to-slate-700"
                        }`}
                      >
                        {initials(participant.display_name || "?")}
                      </div>
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="min-w-0 max-w-full text-lg font-bold text-slate-900" role="heading" aria-level={3}>
                            <LongTextSheet
                              text={participant.display_name}
                              modalTitle="Participante"
                              minLength={36}
                              lineClamp={3}
                              className="font-bold text-slate-900"
                            />
                          </div>
                          {isYou ? (
                            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-violet-800">
                              Tú
                            </span>
                          ) : null}
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${roleStyle(participant.role)}`}
                          >
                            {getRoleLabel(participant.role)}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                            {getStatusLabel(participant.status as "active" | "pending" | "removed")}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                              isLinkedUser ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"
                            }`}
                          >
                            {isLinkedUser ? "Cuenta vinculada" : "Pendiente de vincular"}
                          </span>
                        </div>

                        <dl className="grid min-w-0 grid-cols-1 gap-1 text-sm text-slate-600 sm:grid-cols-2">
                          {participant.username ? (
                            <div>
                              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Usuario</dt>
                              <dd className="font-medium text-slate-800">@{participant.username}</dd>
                            </div>
                          ) : null}
                          {participant.email ? (
                            <div>
                              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Email</dt>
                              <dd className="break-all font-medium text-slate-800">{participant.email}</dd>
                            </div>
                          ) : null}
                          {participant.phone ? (
                            <div>
                              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Teléfono</dt>
                              <dd className="font-medium text-slate-800">{participant.phone}</dd>
                            </div>
                          ) : null}
                          {participant.joined_via ? (
                            <div>
                              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Alta</dt>
                              <dd className="font-medium capitalize text-slate-800">{participant.joined_via}</dd>
                            </div>
                          ) : null}
                        </dl>
                      </div>
                    </div>

                    {canManageParticipants ? (
                      <div className="flex flex-wrap gap-2 md:justify-end">
                        <button
                          type="button"
                          onClick={() => setEditingParticipant(participant)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
                        >
                          <Pencil className="h-4 w-4" aria-hidden />
                          Editar
                        </button>
                        {canInviteThisParticipant ? (
                          <button
                            type="button"
                            onClick={() => openParticipantInvite(participant)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-100"
                          >
                            <MessageCircle className="h-4 w-4" aria-hidden />
                            WhatsApp
                          </button>
                        ) : null}
                        {canInviteThisParticipant ? (
                          <button
                            type="button"
                            onClick={() => openLinkProfile(participant)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-900 transition hover:bg-violet-100"
                          >
                            <Link2 className="h-4 w-4" aria-hidden />
                            Vincular
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void handleRemove(participant.id)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                          Quitar
                        </button>
                      </div>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}
        </section>

        <aside className="min-w-0 space-y-4 lg:sticky lg:top-3 lg:self-start">
          {canManageParticipants ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-extrabold text-slate-950">Control de pasajeros</div>
                <button
                  type="button"
                  onClick={() => void refetch()}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <RefreshCcw className="h-4 w-4" aria-hidden />
                  Recargar
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingParticipant(null);
                    setInviteParticipant(null);
                    setIsInviting(false);
                    setLinkingParticipant(null);
                    setIsCreating((prev) => !prev);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
                >
                  <UserPlus className="h-4 w-4" aria-hidden />
                  {isCreating ? "Cerrar" : "Añadir pasajero"}
                </button>
                <button
                  type="button"
                  onClick={openGenericInvite}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
                >
                  <MessageCircle className="h-4 w-4 text-emerald-600" aria-hidden />
                  {isInviting && !inviteParticipant ? "Cerrar invitación" : "Invitar por WhatsApp"}
                </button>
              </div>

              <p className="mt-3 text-xs text-slate-500">
                Envía un enlace único por WhatsApp. La persona inicia sesión y Kaviro crea o vincula su pasajero automáticamente.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 shadow-sm">
              <p className="font-semibold text-slate-900">Solo lectura</p>
              <p className="mt-1">
                No tienes permisos para gestionar pasajeros en este viaje.
              </p>
            </div>
          )}

          {canManageParticipants && isInviting ? (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-1 shadow-sm">
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
            </div>
          ) : null}

          {canManageParticipants && isCreating ? (
            <ParticipantForm
              tripId={tripId}
              onSubmit={handleCreate}
              onCancel={() => setIsCreating(false)}
              submitLabel="Añadir participante"
            />
          ) : null}

          {canManageParticipants && editingParticipant ? (
            <ParticipantForm
              tripId={tripId}
              initialData={editingParticipant}
              onSubmit={handleUpdate}
              onCancel={() => setEditingParticipant(null)}
              submitLabel="Guardar cambios"
            />
          ) : null}

          {canManageParticipants && linkingParticipant ? (
            <div className="rounded-2xl border border-violet-100 bg-violet-50/40 p-1 shadow-sm">
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
            </div>
          ) : null}
        </aside>
      </div>
    </main>
  );
}
