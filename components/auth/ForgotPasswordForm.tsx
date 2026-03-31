"use client";

import Link from "next/link";
import { useState } from "react";
import { sendPasswordReset } from "@/lib/auth";
import { isValidEmail } from "@/lib/validators/auth";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!isValidEmail(email)) {
      setError("Introduce un email válido");
      return;
    }

    try {
      setLoading(true);
      await sendPasswordReset(email);
      setSuccess("Te hemos enviado un email para recuperar la contraseña.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo enviar el email");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
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
          <label className="mb-1 block text-sm font-medium">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border px-3 py-2"
            autoComplete="email"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-black px-4 py-2 text-white disabled:opacity-50"
        >
          {loading ? "Enviando..." : "Enviar email de recuperación"}
        </button>
      </form>

      <Link href="/auth/login" className="text-sm underline">
        Volver al login
      </Link>
    </div>
  );
}