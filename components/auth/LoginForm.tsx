"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { signInWithEmail } from "@/lib/auth";
import { clearGoogleOAuthAttempt } from "@/lib/google-oauth-attempt";
import GoogleButton from "./GoogleButton";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    clearGoogleOAuthAttempt();
  }, []);

  useEffect(() => {
    // PKCE: Supabase suele redirigir con ?code= y a menudo sin type= en la query.
    // Si cae en /auth/login, intercambiamos el código y vamos a reset.
    const code = searchParams.get("code");
    if (code) {
      const q = new URLSearchParams({
        code,
        next: "/auth/reset-password",
        type: "recovery",
      });
      router.replace(`/auth/callback?${q.toString()}`);
      router.refresh();
      return;
    }

    // Implicit: tokens en el hash solo si es flujo recovery (evita confundir con otros magic links).
    if (typeof window === "undefined") return;
    const hash = window.location.hash || "";
    const qs = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
    const type = (qs.get("type") || "").toLowerCase();
    if (type === "recovery") {
      router.replace(`/auth/reset-password${hash}`);
      router.refresh();
    }
  }, [router, searchParams]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    try {
      setLoading(true);
      await signInWithEmail({ email, password });
      const dest = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
      window.location.assign(dest);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* GOOGLE LOGIN */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
        <GoogleButton />
      </div>

      {/* DIVIDER */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-200" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-white px-3 text-slate-400 tracking-wide">
            o continúa con email
          </span>
        </div>
      </div>

      {/* ERROR */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* FORM */}
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-700">
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm shadow-sm transition focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-200"
            placeholder="tu@email.com"
            autoComplete="email"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-700">
            Contraseña
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm shadow-sm transition focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-200"
            placeholder="••••••••"
            autoComplete="current-password"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 px-4 py-3 text-sm font-semibold text-white shadow-md transition hover:from-blue-700 hover:to-cyan-700 disabled:opacity-50"
        >
          {loading ? "Entrando..." : "Iniciar sesión"}
        </button>
      </form>

      {/* LINKS */}
      <div className="flex flex-col gap-2 text-sm text-slate-600">
        <Link
          href="/auth/forgot-password"
          className="text-center text-slate-500 hover:text-slate-700"
        >
          ¿Olvidaste tu contraseña?
        </Link>

        <Link
          href="/auth/register"
          className="text-center font-semibold text-cyan-600 hover:text-cyan-700"
        >
          Crear cuenta
        </Link>
      </div>
    </div>
  );
}
