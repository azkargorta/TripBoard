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

  // Autocreador eliminado: mantenemos el componente para no romper imports existentes.
  void router;
  void aiBudgetExceeded;
  return null;
}

