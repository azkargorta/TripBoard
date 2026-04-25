"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";

type Props = {
  isPremium: boolean;
  disabled?: boolean;
};

export default function DashboardVirtualAssistantCreateTrip({ isPremium, disabled = false }: Props) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [aiBudgetExceeded, setAiBudgetExceeded] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/ai-budget/status", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!cancelled && res.ok && data && typeof data?.exceeded === "boolean") {
          setAiBudgetExceeded(Boolean(data.exceeded));
        }
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!mounted) return null;
  if (!isPremium) return null;

  return (
    <button
      type="button"
      disabled={disabled || aiBudgetExceeded}
      onClick={() => {
        if (disabled || aiBudgetExceeded) return;
        router.push("/trips/new/auto");
      }}
      className="inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl border-2 border-violet-300 bg-violet-50/80 px-3 py-2 text-center text-xs font-semibold text-violet-950 shadow-sm transition hover:bg-violet-50 disabled:opacity-60 sm:w-auto sm:min-w-[320px] sm:text-sm"
      title={
        aiBudgetExceeded
          ? "Límite mensual alcanzado (se reactivará el mes que viene)"
          : "Crea un viaje automáticamente (con planes por día)"
      }
    >
      <Sparkles className="h-4 w-4 text-violet-700" aria-hidden />
      Crear viaje automático
    </button>
  );
}

