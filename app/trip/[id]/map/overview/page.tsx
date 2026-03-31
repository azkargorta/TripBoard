import { redirect } from "next/navigation";

export default function TripOverviewPage({ params }: { params: { id: string } }) {
  redirect(`/trip/${params.id}`);
}
