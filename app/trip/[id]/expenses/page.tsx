import TripExpensesView from "@/components/trip/expenses/TripExpensesView";
import TripScreenActions from "@/components/trip/common/TripScreenActions";

export default function TripExpensesPage({
  params,
}: {
  params: { id: string };
}) {
  const tripId = params?.id;

  if (!tripId) {
    return (
      <main className="page-shell">
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          No se ha recibido el ID del viaje.
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell space-y-6">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">Gastos</div>
          <h1 className="mt-4 text-4xl font-black tracking-tight text-slate-950 md:text-5xl">Control de gastos</h1>
        </div>
        <TripScreenActions tripId={tripId} />
      </section>

      <TripExpensesView tripId={tripId} />
    </main>
  );
}
