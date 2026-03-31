import Link from "next/link";

export default function TripTabActions({ tripId }: { tripId: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Link href={`/trip/${tripId}`} className="btn-secondary">
        Pantalla de resumen
      </Link>
      <Link href="/dashboard" className="btn-secondary">
        Pantalla de inicio
      </Link>
    </div>
  );
}
