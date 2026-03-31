"use client";

import Script from "next/script";
import { useTripData } from "@/hooks/useTripData";
import TripPlanView from "@/components/trip/plan/TripPlanView";
import TripTabActions from "@/components/trip/common/TripTabActions";

export default function TripPlanPage({
  params,
}: {
  params: { id: string };
}) {
  const { trip, activities, loading, error, reload } = useTripData(params.id);

  if (loading) {
    return <p style={{ padding: 16 }}>Cargando plan...</p>;
  }

  return (
    <>
      <Script
        id="google-maps-places-plan"
        src={`https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}&libraries=places`}
        strategy="afterInteractive"
      />

      <main className="page-shell" style={{ display: "grid", gap: 24 }}>
        <section className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 12px",
                borderRadius: 999,
                background: "#f3e8ff",
                color: "#7c3aed",
                fontWeight: 700,
                fontSize: 14,
                marginBottom: 12,
              }}
            >
              Plan
            </div>

            <h1 style={{ margin: 0, fontSize: 42, fontWeight: 900, color: "#0f172a" }}>
              {trip?.name ? `Plan · ${trip.name}` : "Plan"}
            </h1>

            <p style={{ marginTop: 12, color: "#475569", fontSize: 16, maxWidth: 900 }}>
              Añade lugares, fechas, horas y coordenadas. Todo lo guardado aquí se reutiliza
              en la pestaña de mapa para crear rutas y organizar el viaje.
            </p>
          </div>

          <TripTabActions tripId={params.id} />
        </section>

        {error ? (
          <div
            style={{
              padding: 16,
              borderRadius: 16,
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#b91c1c",
              fontWeight: 700,
            }}
          >
            {error}
          </div>
        ) : null}

        <TripPlanView tripId={params.id} activities={activities} reload={reload} />
      </main>
    </>
  );
}
