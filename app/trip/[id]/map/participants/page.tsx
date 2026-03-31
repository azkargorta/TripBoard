import TripParticipantsView from "@/components/trip/participants/TripParticipantsView";
import TripTabActions from "@/components/trip/common/TripTabActions";

type ParticipantsPageProps = {
  params: {
    id: string;
  };
};

export default function ParticipantsPage({ params }: ParticipantsPageProps) {
  return (
    <main className="page-shell space-y-6">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">
            Participantes
          </div>
          <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950 md:text-5xl">
            Personas y permisos del viaje
          </h1>
          <p className="mt-3 max-w-3xl text-slate-600">
            Gestiona viajeros, invitaciones, roles y permisos desde una sola vista.
          </p>
        </div>

        <TripTabActions tripId={params.id} />
      </section>

      <TripParticipantsView tripId={params.id} />
    </main>
  );
}
