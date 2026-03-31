"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { signInWithGoogle } from "@/lib/auth";

export default function GoogleButton() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGoogle() {
    try {
      setLoading(true);
      setError(null);
      await signInWithGoogle(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo continuar con Google");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={handleGoogle}
        disabled={loading}
        className="w-full rounded-lg border px-4 py-2 font-medium"
      >
        {loading ? "Redirigiendo..." : "Continuar con Google"}
      </button>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}