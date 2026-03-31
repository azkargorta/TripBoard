"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

export default function SignOutButton() {
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    if (loading) return;

    setLoading(true);

    try {
      await Promise.race([
        supabase.auth.signOut(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout al cerrar sesión")), 5000)
        ),
      ]);
    } catch (error) {
      console.error("Error cerrando sesión:", error);
    } finally {
      window.location.href = "/auth/login";
    }
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={loading}
      className="rounded-lg border px-4 py-2 text-sm"
    >
      {loading ? "Saliendo..." : "Cerrar sesión"}
    </button>
  );
}