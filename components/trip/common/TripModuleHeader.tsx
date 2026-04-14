import TripBoardPageHeader from "@/components/layout/TripBoardPageHeader";
import TripTabActions from "@/components/trip/common/TripTabActions";

type TripModuleHeaderProps = {
  tripId: string;
  title: string;
  subtitle?: string;
  description?: string;
  eyebrow?: string;
  iconSrc?: string;
  iconAlt?: string;
};

export default function TripModuleHeader({
  tripId,
  title,
  subtitle,
  description,
  eyebrow,
  iconSrc,
  iconAlt,
}: TripModuleHeaderProps) {
  const text = subtitle ?? description ?? "";

  return (
    <TripBoardPageHeader
      section={eyebrow ?? title}
      title={title}
      description={text || undefined}
      iconSrc={iconSrc}
      iconAlt={iconAlt}
      actions={<TripTabActions tripId={tripId} />}
    />
  );
}
