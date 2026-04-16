"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
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
  const searchParams = useSearchParams();
  const [username, setUsername] = useState(initial.username);
  const [usernameStatus, setUsernameStatus] = useState<string | null>(null);
  const [usernameSaving, setUsernameSaving] = useState(false);

  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwStatus, setPwStatus] = useState<string | null>(null);
  const [pwSaving, setPwSaving] = useState(false);

  const planLabel = initial.isPremium ? "Premium" : "Gratis";
  const [billingStatus, setBillingStatus] = useState<string | null>(null);
  const [billingLoading, setBillingLoading] = useState(false);
  const monthlyPriceLabel = "3,99€ / mes";
  const yearlyPriceLabel = "39,99€ / año";
  const [highlightPlans, setHighlightPlans] = useState(false);

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

  async function startCheckout(plan: "monthly" | "yearly") {
    setBillingStatus(null);
    setBillingLoading(true);
    try {
      const resp = await withTimeout(
        fetch("/api/billing/checkout", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan }),
        }),
        20_000,
        "Timeout iniciando el pago."
      );
      const payload = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(payload?.error || `Error ${resp.status}`);
      const url = String(payload?.url || "");
      if (!url) throw new Error("Stripe no devolvió URL de checkout.");
      window.location.assign(url);
    } catch (e) {
      setBillingStatus(e instanceof Error ? e.message : "No se pudo iniciar el pago.");
    } finally {
      setBillingLoading(false);
    }
  }

  async function openPortal() {
    setBillingStatus(null);
    setBillingLoading(true);
    try {
      const resp = await withTimeout(
        fetch("/api/billing/portal", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        }),
        20_000,
        "Timeout abriendo el portal."
      );
      const payload = await resp.json().catch(() => null);
      if (!resp.ok) throw new Error(payload?.error || `Error ${resp.status}`);
      const url = String(payload?.url || "");
      if (!url) throw new Error("Stripe no devolvió URL de portal.");
      window.location.assign(url);
    } catch (e) {
      setBillingStatus(e instanceof Error ? e.message : "No se pudo abrir el portal.");
    } finally {
      setBillingLoading(false);
    }
  }

  useEffect(() => {
    const upgrade = searchParams?.get("upgrade");
    const focus = searchParams?.get("focus");
    const shouldFocus = upgrade === "premium" || focus === "premium";
    if (!shouldFocus) return;

    const el = document.getElementById("premium-plans");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setHighlightPlans(true);
      window.setTimeout(() => setHighlightPlans(false), 1800);
    }
  }, [searchParams]);

  return (
    <div className="space-y-8">
      <section
        id="premium-plans"
        className={`card-soft p-6 transition ${
          highlightPlans ? "ring-2 ring-cyan-300/60 ring-offset-2 ring-offset-slate-50" : ""
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Plan</p>
            <p className="text-2xl font-bold text-slate-950">{planLabel}</p>
            <p className="text-sm text-slate-600">
              {initial.isPremium
                ? "Tienes acceso completo a IA, mapas, rutas y análisis."
                : "El plan gratuito incluye mapas, rutas y autocompletar. Premium desbloquea IA y funciones avanzadas."}
            </p>
          </div>
          <div className="w-full sm:w-auto">
            {!initial.isPremium ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => startCheckout("monthly")}
                  disabled={billingLoading}
                  className="group flex w-full flex-col justify-between rounded-3xl border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50"
                >
                  <div className="space-y-2">
                    <div className="inline-flex items-center gap-2">
                      <span className="inline-flex h-2 w-2 rounded-full bg-cyan-500" aria-hidden />
                      <span className="text-sm font-semibold text-slate-950">Premium mensual</span>
                    </div>
                    <p className="text-sm text-slate-600">
                      Pago recurrente. Ideal para probar sin compromiso.
                    </p>
                  </div>
                  <div className="mt-4 flex items-end justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-900">
                      {monthlyPriceLabel}
                    </div>
                    <div className="inline-flex min-h-[40px] items-center justify-center rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition group-hover:bg-slate-800">
                      {billingLoading ? "Abriendo…" : "Elegir"}
                    </div>
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-slate-500">
                    Se autorrenueva cada mes hasta que canceles. Puedes cancelar cuando quieras desde “Gestionar suscripción”.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => startCheckout("yearly")}
                  disabled={billingLoading}
                  className="group flex w-full flex-col justify-between rounded-3xl border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50"
                >
                  <div className="space-y-2">
                    <div className="inline-flex items-center gap-2">
                      <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
                      <span className="text-sm font-semibold text-slate-950">Premium anual</span>
                    </div>
                    <p className="text-sm text-slate-600">
                      Mejor valor. Ahorra frente al plan mensual.
                    </p>
                  </div>
                  <div className="mt-4 flex items-end justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-slate-900">{yearlyPriceLabel}</div>
                      <div className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                        2 meses gratis
                      </div>
                    </div>
                    <div className="inline-flex min-h-[40px] items-center justify-center rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition group-hover:bg-slate-800">
                      {billingLoading ? "Abriendo…" : "Elegir"}
                    </div>
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-slate-500">
                    Se autorrenueva cada año hasta que canceles. Puedes cancelar cuando quieras desde “Gestionar suscripción”.
                  </p>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={openPortal}
                disabled={billingLoading}
                className="inline-flex min-h-[44px] items-center justify-center rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
              >
                {billingLoading ? "Abriendo…" : "Gestionar suscripción"}
              </button>
            )}
          </div>
        </div>
        {billingStatus ? (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            {billingStatus}
          </div>
        ) : null}
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
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
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
          className="inline-flex min-h-[44px] items-center justify-center rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
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
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
              autoComplete="new-password"
            />
          </label>
          <label className="space-y-2">
            <span className="text-sm font-semibold text-slate-800">Repetir contraseña</span>
            <input
              type="password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-100"
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

