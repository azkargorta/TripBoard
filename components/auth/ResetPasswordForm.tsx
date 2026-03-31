"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { updateMyPassword } from "@/lib/auth";
import { isValidPassword } from "@/lib/validators/auth";

export default function ResetPasswordForm() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
      await updateMyPassword(password);
      setSuccess("Contraseña actualizada correctamente.");

      setTimeout(() => {
        router.push("/auth/login");
        router.refresh();
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar la contraseña");
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
          <label className="mb-1 block text-sm font-medium">Nueva contraseña</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border px-3 py-2"
            autoComplete="new-password"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            Confirmar nueva contraseña
          </label>
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
          {loading ? "Guardando..." : "Guardar nueva contraseña"}
        </button>
      </form>
    </div>
  );
}