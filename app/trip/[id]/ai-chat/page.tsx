import TripAiChatView from "@/components/trip/ai/TripAiChatView";

export default function Page({ params }: { params: { id: string } }) {
  return <TripAiChatView tripId={params.id} />;
}
