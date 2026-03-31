import TripTabActions from "@/components/trip/common/TripTabActions";

type TripModuleHeaderProps = {
  tripId: string;
  title: string;
  subtitle?: string;
  description?: string;
};

export default function TripModuleHeader({
  tripId,
  title,
  subtitle,
  description,
}: TripModuleHeaderProps) {
  const text = subtitle ?? description ?? "";

  return (
    <section className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="mb-4 inline-block rounded-full bg-purple-100 px-3 py-1 text-sm font-semibold text-purple-700">
          {title}
        </div>
        <h1 className="mb-3 text-3xl font-bold text-slate-900">{title}</h1>
        {text ? <p className="max-w-2xl text-slate-600">{text}</p> : null}
      </div>

      <TripTabActions tripId={tripId} />
    </section>
  );
}
