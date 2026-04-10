"use client";

import { useEffect, useState } from "react";
import { isValidPassword } from "@/lib/validators/auth";
import { createClient } from "@/lib/supabase/client";
import { withTimeout } from "@/lib/with-timeout";

export default function ResetPasswordForm() {
  const [ready, setReady] = useState(false);
  /** Sesión lista para updateUser (cookies tras /auth/verify o hash implícito). */
  const [canSubmit, setCanSubmit] = useState(false);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    // Hash (flujo implícito) o cookies (flujo /auth/verify): hace falta sesión en el cliente.
    async function hydrateSessionFromHash() {
      try {
        if (typeof window === "undefined") return;
        const hash = window.location.hash || "";
        const qs = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
        const access_token = qs.get("access_token");
        const refresh_token = qs.get("refresh_token");

        if (access_token && refresh_token) {
          const supabase = createClient();
          const { error: setErr } = await supabase.auth.setSession({ access_token, refresh_token });
          if (setErr) {
            setError(setErr.message);
            setReady(true);
            return;
          }
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
          setCanSubmit(true);
          setReady(true);
          return;
        }

        const sessionRes = await withTimeout(
          fetch("/api/auth/recovery-session", { credentials: "include" }),
          12_000,
          "No se pudo comprobar la sesión. Recarga la página o abre de nuevo el enlace del correo."
        ).catch((e) => {
          throw e instanceof Error ? e : new Error(String(e));
        });

        if (!sessionRes.ok) {
          setError(`Error de red (${sessionRes.status}). Reintenta.`);
          setReady(true);
          return;
        }

        const j = (await sessionRes.json().catch(() => ({ ok: false }))) as { ok?: boolean };
        if (!j.ok) {
          setError(
            "No hay sesión de recuperación. Vuelve a abrir el enlace del último correo (o pide uno nuevo en «Olvidé mi contraseña»)."
          );
          setReady(true);
          return;
        }

        setCanSubmit(true);
        setReady(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo preparar la sesión de recuperación.");
        setReady(true);
      }
    }
    void hydrateSessionFromHash();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!isValidPassword(password)) {
      setError("La contraseña debe tener al menos 8 caracteres");
      return;
    }

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden");
      return;
    }

    try {
      setLoading(true);
      if (!ready || !canSubmit) {
        throw new Error("Preparando sesión de recuperación… reintenta en unos segundos.");
      }

      const res = await withTimeout(
        fetch("/api/auth/update-password", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        }),
        25_000,
        "El servidor tardó demasiado. Comprueba la conexión e inténtalo otra vez."
      );

      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        throw new Error(payload?.error || `Error ${res.status}`);
      }
      setSuccess("Contraseña actualizada correctamente.");

      setTimeout(() => {
        window.location.assign("/auth/login");
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar la contraseña");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <div className="font-semibold">No se pudo actualizar</div>
          <div className="mt-1 opacity-90">{error}</div>
        </div>
      ) : null}

      {!ready && !error ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          Preparando enlace de recuperación…
        </div>
      ) : null}

      {success ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <div className="font-semibold">Contraseña actualizada</div>
          <div className="mt-1 opacity-90">{success}</div>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-700">Contraseña nueva</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm shadow-sm transition focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
            placeholder="••••••••"
            autoComplete="new-password"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-700">Repite contraseña</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm shadow-sm transition focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
            placeholder="••••••••"
            autoComplete="new-password"
          />
        </div>

        <button
          type="submit"
          disabled={loading || !ready || !canSubmit}
          className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-md transition hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50"
        >
          {loading ? "Validando..." : "Validar contraseña"}
        </button>
      </form>
    </div>
  );
}