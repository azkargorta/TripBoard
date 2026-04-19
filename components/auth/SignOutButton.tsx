"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { supabase } from "@/lib/supabase";

type SignOutButtonProps = {
  className?: string;
  /** Icono a la izquierda (p. ej. en menús móviles). */
  showIcon?: boolean;
  /** Clases del icono Lucide cuando `showIcon` (p. ej. tamaño en menú compacto). */
  iconClassName?: string;
  /** Contenedor alrededor del icono (p. ej. tile con gradiente). */
  iconSlotClassName?: string;
};

export default function SignOutButton({
  className,
  showIcon = false,
  iconClassName,
  iconSlotClassName,
}: SignOutButtonProps) {
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

  const mergedClass = [
    className?.trim() ||
      "rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50",
    showIcon ? "inline-flex items-center gap-2" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={loading}
      className={mergedClass}
    >
      {showIcon ? (
        iconSlotClassName ? (
          <span className={iconSlotClassName}>
            <LogOut className={iconClassName ?? "size-8 shrink-0 opacity-90"} aria-hidden />
          </span>
        ) : (
          <LogOut className={iconClassName ?? "size-8 shrink-0 opacity-90"} aria-hidden />
        )
      ) : null}
      {loading ? "Saliendo..." : "Cerrar sesión"}
    </button>
  );
}