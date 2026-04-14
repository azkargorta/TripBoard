import TripExpensesView from "@/components/trip/expenses/TripExpensesView";
import TripScreenActions from "@/components/trip/common/TripScreenActions";
import TripBoardPageHeader from "@/components/layout/TripBoardPageHeader";
import { requireTripAccess } from "@/lib/trip-access";
import { createClient } from "@/lib/supabase/server";
import { isPremiumEnabledForTrip } from "@/lib/entitlements";

export default async function TripExpensesPage({
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

  const access = await requireTripAccess(tripId);
  const supabase = await createClient();
  const isPremium = await isPremiumEnabledForTrip({ supabase, userId: access.userId, tripId });

  return (
    <main className="space-y-6">
      <TripBoardPageHeader
        section="Gastos del viaje"
        title="Control de gastos"
        description="Registra tickets, divide importes entre pasajeros, convierte moneda y marca pagos pendientes."
        iconSrc="/brand/tabs/expenses.png"
        iconAlt="Gastos"
        actions={<TripScreenActions tripId={tripId} />}
      />

      <TripExpensesView tripId={tripId} isPremium={isPremium} />
    </main>
  );
}
