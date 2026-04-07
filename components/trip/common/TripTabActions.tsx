import Link from "next/link";

type Props = {
  tripId: string;
  variant?: "default" | "inverse";
};

export default function TripTabActions({ tripId, variant = "default" }: Props) {
  const className =
    variant === "inverse"
      ? "inline-flex min-h-[44px] items-center justify-center rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
      : "btn-secondary";

  return (
    <div className="flex flex-wrap gap-2">
      <Link href={`/trip/${tripId}`} className={className}>
        Pantalla de resumen
      </Link>
      <Link href="/dashboard" className={className}>
        Pantalla de inicio
      </Link>
    </div>
  );
}
