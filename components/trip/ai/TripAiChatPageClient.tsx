"use client";

import dynamic from "next/dynamic";

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
}: {
  tripId: string;
  isPremium: boolean;
  /** Solo con `?recien=1`, plan vacío y destino o rango de fechas (regla conservadora). */
  autoBootstrapItinerary?: boolean;
}) {
  return <TripAiChatView tripId={tripId} isPremium={isPremium} autoBootstrapItinerary={autoBootstrapItinerary} />;
}
