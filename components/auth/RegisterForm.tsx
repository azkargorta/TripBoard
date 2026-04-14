"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { signUpWithEmail } from "@/lib/auth";
import { clearGoogleOAuthAttempt } from "@/lib/google-oauth-attempt";
import {
  isValidEmail,
  isValidPassword,
  isValidUsername,
} from "@/lib/validators/auth";
import GoogleButton from "./GoogleButton";

export default function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const loginHref = next ? `/auth/login?next=${encodeURIComponent(next)}` : "/auth/login";

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    clearGoogleOAuthAttempt();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!isValidUsername(username.trim().toLowerCase())) {
      setError(
        "El nombre de usuario debe tener entre 3 y 20 caracteres y usar solo letras minúsculas, números o guion bajo"
      );
      return;
    }

    if (!isValidEmail(email)) {
      setError("Introduce un email válido");
      return;
    }

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

      await signUpWithEmail({
        username,
        email,
        password,
      });

      setSuccess("Cuenta creada. Revisa tu email para confirmar la cuenta antes de entrar.");
      setUsername("");
      setEmail("");
      setPassword("");
      setConfirmPassword("");
      router.push("/auth/login");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la cuenta");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <GoogleButton />

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-white px-2 text-slate-500">o continúa con email</span>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          {success}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Nombre de usuario</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            className="w-full rounded-lg border px-3 py-2"
            placeholder="gori_123"
            autoComplete="username"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border px-3 py-2"
            placeholder="tu@email.com"
            autoComplete="email"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Contraseña</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border px-3 py-2"
            autoComplete="new-password"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">Confirmar contraseña</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-lg border px-3 py-2"
            autoComplete="new-password"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? "Creando cuenta..." : "Crear cuenta"}
        </button>
      </form>

      <p className="text-sm text-slate-600">
        ¿Ya tienes cuenta?{" "}
        <Link href={loginHref} className="font-medium underline">
          Inicia sesión
        </Link>
      </p>
    </div>
  );
}