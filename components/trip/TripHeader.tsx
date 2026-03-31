"use client";

import Link from "next/link";
import { Badge } from "@/components/ui";
import type { Trip } from "@/types/trip";

export default function TripHeader({ trip }: { trip: Trip | null | undefined }) {
  if (!trip) {
    return null;
  }

  return (
    <div>
      <Link
        href="/dashboard"
        style={{
          display: "inline-flex",
          marginBottom: 18,
          color: "var(--muted)",
          fontWeight: 700,
          textDecoration: "none",
        }}
      >
        ← Mis viajes
      </Link>

      <div className="trip-header">
        <div>
          <h1
            style={{
              fontSize: 50,
              lineHeight: 1.02,
              margin: "0 0 12px",
              textTransform: "lowercase",
            }}
          >
            {trip.name || "viaje sin nombre"}
          </h1>

          <div className="trip-meta">
            <span>📍 {trip.destination || "Sin destino"}</span>
            <span>
              📅 {trip.start_date || "?"} — {trip.end_date || "?"}
            </span>
          </div>
        </div>

        <div className="trip-actions">
          <Badge>Viaje real</Badge>

          <Link href={`/trip/${trip.id}/settings`} style={secondaryLinkButtonStyle()}>
            Editar viaje
          </Link>
        </div>
      </div>
    </div>
  );
}

function secondaryLinkButtonStyle(): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    padding: "12px 18px",
    borderRadius: 14,
    fontWeight: 800,
    border: "1px solid var(--border)",
    whiteSpace: "nowrap",
    background: "#fff",
    color: "#0f172a",
    textDecoration: "none",
  };
}