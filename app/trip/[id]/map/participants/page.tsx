import TripParticipantsView from "@/components/trip/participants/TripParticipantsView";

type ParticipantsPageProps = {
  params: {
    id: string;
  };
};

export default function ParticipantsPage({ params }: ParticipantsPageProps) {
  return <TripParticipantsView tripId={params.id} mapFlow />;
}
