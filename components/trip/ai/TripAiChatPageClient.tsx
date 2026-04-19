"use client";

import dynamic from "next/dynamic";
import type { TripAiMode } from "@/lib/trip-ai/buildPrompt";

const TripAiChatView = dynamic(() => import("@/components/trip/ai/TripAiChatView"), {
  loading: () => (
    <main className="page-shell py-20 text-center text-slate-500">
      <p className="text-sm font-medium">Cargando asistente personal…</p>
    </main>
  ),
});

export default function TripAiChatPageClient({
  tripId,
  isPremium,
  autoBootstrapItinerary = false,
  launchIntent = null,
  defaultAssistantMode = null,
}: {
  tripId: string;
  isPremium: boolean;
  /** Solo con `?recien=1`, plan vacío y destino o rango de fechas (regla conservadora). */
  autoBootstrapItinerary?: boolean;
  /** Atajos del dashboard: `?intent=optimize` o `?intent=auto_plans`. */
  launchIntent?: "optimize" | "auto_plans" | null;
  /** Desde `?modo=…` (p. ej. planificador al crear viaje). */
  defaultAssistantMode?: TripAiMode | null;
}) {
  return (
    <div className="w-full min-w-0 max-w-full">
      <TripAiChatView
        tripId={tripId}
        isPremium={isPremium}
        autoBootstrapItinerary={autoBootstrapItinerary}
        launchIntent={launchIntent}
        defaultAssistantMode={defaultAssistantMode}
      />
    </div>
  );
}
