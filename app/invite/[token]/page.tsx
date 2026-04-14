"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  acceptInviteToken,
  getInviteByToken,
  type TripInviteRecord,
} from "@/lib/trip-invite-accept";
import { withTimeout } from "@/lib/with-timeout";

type InvitePageProps = {
  params: {
    token: string;
  };
};

export default function InvitePage({ params }: InvitePageProps) {
  const token = params.token;

  const [invite, setInvite] = useState<TripInviteRecord | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [acceptedTripId, setAcceptedTripId] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  async function fetchServerUserId(): Promise<string | null> {
    let res: Response;
    try {
      res = await withTimeout(
        fetch("/api/auth/me", { method: "GET", credentials: "include", cache: "no-store" }),
        6_000,
        "timeout"
      );
    } catch {
      return null;
    }

    if (!res.ok) return null;

    const payload = (await res.json().catch(() => null)) as { ok?: boolean; userId?: string | null } | null;
    if (!payload?.ok || !payload.userId) return null;
    return payload.userId;
  }

  useEffect(() => {
    async function load() {
      try {
        setLoadingInvite(true);
        setError(null);
        setInvite(null);

        // Importante: en Safari/WebViews, getSession() puede no resolver nunca.
        // Cargamos la invitación igualmente y tratamos el usuario por separado con timeout.
        const [inviteData, userId] = await Promise.all([
          getInviteByToken(token),
          fetchServerUserId(),
        ]);

        setCurrentUserId(userId);
        setInvite(inviteData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cargar la invitación");
      } finally {
        setLoadingInvite(false);
      }
    }

    load();
  }, [token, reloadNonce]);

  // Tras OAuth, a veces las cookies de sesión tardan un instante en quedar visibles para el cliente.
  // Reintentamos la lectura server-side (/api/auth/me) unas pocas veces.
  useEffect(() => {
    if (!invite || currentUserId) return;

    let cancelled = false;
    let attempts = 0;

    const id = window.setInterval(async () => {
      attempts += 1;
      try {
        const uid = await fetchServerUserId();
        if (uid && !cancelled) {
          setCurrentUserId(uid);
          window.clearInterval(id);
        }
      } catch {
        /* */
      }

      if (attempts >= 14) {
        window.clearInterval(id);
      }
    }, 450);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [invite, currentUserId, token]);

  const statusLabel = useMemo(() => {
    if (!invite) return "";
    if (invite.status === "accepted") return "Aceptada";
    if (invite.status === "expired") return "Caducada";
    if (invite.status === "cancelled") return "Cancelada";
    return "Pendiente";
  }, [invite]);

  async function handleAccept() {
    try {
      setAccepting(true);
      setError(null);
      setInfo(null);

      const result = await acceptInviteToken(token);

      setAcceptedTripId(result.invite.trip_id);
      setInvite({
        ...result.invite,
        status: "accepted",
      });

      setInfo(
        result.alreadyAccepted
          ? "Esta invitación ya estaba aceptada. Te llevamos al viaje."
          : "Invitación aceptada y usuario vinculado correctamente."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo aceptar la invitación");
    } finally {
      setAccepting(false);
    }
  }

  if (loadingInvite) {
    return <div className="p-6">Cargando invitación...</div>;
  }

  if (!invite) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
          {error ? error : "No se encontró la invitación."}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setReloadNonce((n) => n + 1)}
            className="rounded-lg border bg-white px-4 py-2 text-sm"
          >
            Reintentar
          </button>
          <Link href="/auth/login" className="rounded-lg border bg-white px-4 py-2 text-sm">
            Ir al login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="mb-4">
          <h1 className="text-2xl font-bold">Invitación al viaje</h1>
          <p className="mt-2 text-sm text-gray-600">
            Estás entrando con un enlace de invitación de Kaviro.
          </p>
        </div>

        <div className="grid gap-3 text-sm">
          <div>
            <span className="font-medium">Nombre:</span>{" "}
            {invite.display_name || "Participante"}
          </div>
          <div>
            <span className="font-medium">Rol:</span> {invite.role}
          </div>
          <div>
            <span className="font-medium">Estado:</span> {statusLabel}
          </div>
          {invite.email && (
            <div>
              <span className="font-medium">Email:</span> {invite.email}
            </div>
          )}
        </div>

        {!currentUserId && (
          <div className="mt-6 rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
            Debes iniciar sesión o registrarte antes de aceptar la invitación.
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href={`/auth/login?next=/invite/${token}`}
                className="rounded-lg border bg-white px-4 py-2"
              >
                Iniciar sesión
              </Link>
              <Link
                href={`/auth/register?next=/invite/${token}`}
                className="rounded-lg border bg-white px-4 py-2"
              >
                Crear cuenta
              </Link>
            </div>
          </div>
        )}

        {currentUserId && invite.status !== "accepted" && (
          <div className="mt-6">
            <button
              onClick={handleAccept}
              disabled={accepting}
              className="rounded-lg bg-black px-4 py-2 text-white disabled:opacity-60"
            >
              {accepting ? "Aceptando..." : "Aceptar invitación"}
            </button>
          </div>
        )}

        {currentUserId && invite.status === "accepted" && (
          <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            Esta invitación ya ha sido aceptada.
          </div>
        )}

        {info && (
          <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
            {info}
          </div>
        )}

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          {acceptedTripId ? (
            <Link
              href={`/trip/${acceptedTripId}`}
              className="rounded-lg border px-4 py-2 text-sm"
            >
              Ir al viaje
            </Link>
          ) : (
            <Link
              href="/dashboard"
              className="rounded-lg border px-4 py-2 text-sm"
            >
              Ir al dashboard
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
