import TripExpensesView from "@/components/trip/expenses/TripExpensesView";
import TripTabActions from "@/components/trip/common/TripTabActions";
import TripBoardPremiumHero from "@/components/layout/TripBoardPremiumHero";

export default function TripExpensesPage({
  params,
}: {
  params: { id: string };
}) {
  const tripId = params?.id;

  if (!tripId) {
    return (
      <main>
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          No se ha recibido el ID del viaje.
        </div>
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <TripBoardPremiumHero
        eyebrow="Gastos del viaje"
        title="Control económico del viaje"
        description="Añade gastos, revisa balances, analiza tickets y controla quién debe a quién."
        actions={<TripTabActions tripId={tripId} variant="inverse" />}
      />

      <TripExpensesView tripId={tripId} />
    </main>
  );
}
