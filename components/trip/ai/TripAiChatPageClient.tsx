"use client";

import dynamic from "next/dynamic";

const TripAiChatView = dynamic(() => import("@/components/trip/ai/TripAiChatView"), {
  loading: () => (
    <main className="page-shell py-20 text-center text-slate-500">
      <p className="text-sm font-medium">Cargando asistente personal…</p>
    </main>
  ),
});

export default function TripAiChatPageClient({ tripId, isPremium }: { tripId: string; isPremium: boolean }) {
  return <TripAiChatView tripId={tripId} isPremium={isPremium} />;
}
