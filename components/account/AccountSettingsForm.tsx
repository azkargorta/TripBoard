"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { isValidPassword, isValidUsername, normalizeUsername } from "@/lib/validators/auth";
import { withTimeout } from "@/lib/with-timeout";

type Props = {
  initial: {
    username: string;
    email: string;
    isPremium: boolean;
  };
};

export default function AccountSettingsForm({ initial }: Props) {
  const [username, setUsername] = useState(initial.username);
  const [usernameStatus, setUsernameStatus] = useState<string | null>(null);
  const [usernameSaving, setUsernameSaving] = useState(false);

  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwStatus, setPwStatus] = useState<string | null>(null);
  const [pwSaving, setPwSaving] = useState(false);

  const planLabel = initial.isPremium ? "Premium" : "Gratis";

  const normalized = useMemo(() => normalizeUsername(username), [username]);
  const usernameValid = isValidUsername(normalized);

  async function checkUsernameAvailability(u: string) {
    const resp = await withTimeout(
      fetch(`/api/auth/username-available?username=${encodeURIComponent(u)}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      }),
      10_000,
      "Timeout comprobando el username."
    );
    const payload = await resp.json().catch(() => null);
    if (!resp.ok) {
      throw new Error(payload?.error || `Error ${resp.status}`);
    }
    return Boolean(payload?.available);
  }

  async function saveUsername() {
    setUsernameStatus(null);
    if (!usernameValid) {
      setUsernameStatus("El username debe tener 3–20 caracteres: a-z, 0-9 o _."); 
      return;
    }
    if (normalized === initial.username) {
      setUsernameStatus("No hay cambios.");
      return;
    }

    setUsernameSaving(true);
    try {
      const available = await checkUsernameAvailability(normalized);
      if (!available) {
        setUsernameStatus("Ese username ya está en uso.");
        return;
      }

      const resp = await withTimeout(
        fetch("/api/account/username", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: normalized }),
        }),
        15_000,
        "Timeout guardando el username."
      );
      const payload = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(payload?.error || `Error ${resp.status}`);
      setUsernameStatus("Username actualizado.");
      // recargar para actualizar header/otras vistas
      window.location.reload();
    } catch (e) {
      setUsernameStatus(e instanceof Error ? e.message : "No se pudo actualizar el username.");
    } finally {
      setUsernameSaving(false);
    }
  }

  async function savePassword() {
    setPwStatus(null);
    if (pw1 !== pw2) {
      setPwStatus("Las contraseñas no coinciden.");
      return;
    }
    if (!isValidPassword(pw1)) {
      setPwStatus("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    setPwSaving(true);
    try {
      const resp = await withTimeout(
        fetch("/api/account/password", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: pw1 }),
        }),
        20_000,
        "Timeout cambiando la contraseña."
      );
      const payload = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(payload?.error || `Error ${resp.status}`);
      setPwStatus("Contraseña actualizada.");
      setPw1("");
      setPw2("");
    } catch (e) {
      setPwStatus(e instanceof Error ? e.message : "No se pudo cambiar la contraseña.");
    } finally {
      setPwSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="card-soft p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Plan</p>
            <p className="text-2xl font-bold text-slate-950">{planLabel}</p>
            <p className="text-sm text-slate-600">
              {initial.isPremium
                ? "Tienes acceso completo a IA, mapas, rutas y análisis."
                : "IA, mapas/rutas y coordenadas están bloqueados en el plan gratuito."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard?upgrade=premium"
              className="inline-flex min-h-[44px] items-center justify-center rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Pasar a Premium
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex min-h-[44px] items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Volver al dashboard
            </Link>
          </div>
        </div>
      </section>

      <section className="card-soft p-6 space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Perfil</p>
          <h2 className="mt-1 text-xl font-bold text-slate-950">Nombre de usuario</h2>
          <p className="mt-1 text-sm text-slate-600">
            Debe ser único. Solo minúsculas, números y guion bajo.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Email</span>
            <input
              value={initial.email}
              disabled
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Username</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
              placeholder="tu_username"
            />
            <p className={`text-xs ${usernameValid ? "text-slate-500" : "text-amber-700"}`}>
              {usernameValid ? "Formato válido." : "Formato inválido (3–20, a-z 0-9 _)."}
            </p>
          </label>
        </div>

        {usernameStatus ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            {usernameStatus}
          </div>
        ) : null}

        <button
          type="button"
          onClick={saveUsername}
          disabled={usernameSaving}
          className="inline-flex min-h-[44px] items-center justify-center rounded-2xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {usernameSaving ? "Guardando…" : "Guardar username"}
        </button>
      </section>

      <section className="card-soft p-6 space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Seguridad</p>
          <h2 className="mt-1 text-xl font-bold text-slate-950">Cambiar contraseña</h2>
          <p className="mt-1 text-sm text-slate-600">
            Requiere que tengas sesión iniciada. Si te pide reautenticación, vuelve a iniciar sesión y reintenta.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Nueva contraseña</span>
            <input
              type="password"
              value={pw1}
              onChange={(e) => setPw1(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
              autoComplete="new-password"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Repetir contraseña</span>
            <input
              type="password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
              autoComplete="new-password"
            />
          </label>
        </div>

        {pwStatus ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            {pwStatus}
          </div>
        ) : null}

        <button
          type="button"
          onClick={savePassword}
          disabled={pwSaving}
          className="inline-flex min-h-[44px] items-center justify-center rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pwSaving ? "Actualizando…" : "Cambiar contraseña"}
        </button>
      </section>
    </div>
  );
}

