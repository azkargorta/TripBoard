"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Registra una visita por ruta para usuarios autenticados (la API devuelve 401 si no hay sesión).
 * Evita duplicados rápidos en la misma ruta (15s).
 */
export default function TrackPageView() {
  const pathname = usePathname() || "";
  const lastRef = useRef<{ path: string; t: number }>({ path: "", t: 0 });

  useEffect(() => {
    if (!pathname || pathname.startsWith("/auth/")) return;
    const now = Date.now();
    if (lastRef.current.path === pathname && now - lastRef.current.t < 15_000) return;
    lastRef.current = { path: pathname, t: now };

    void fetch("/api/analytics/pageview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        path: pathname,
        referrer: typeof document !== "undefined" ? document.referrer || null : null,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent?.slice(0, 512) : null,
      }),
    }).catch(() => {});
  }, [pathname]);

  return null;
}
