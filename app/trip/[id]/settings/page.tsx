"use client";

import ModulePermissionNotice from "@/components/trip/common/ModulePermissionNotice";
import TripModuleHeader from "@/components/trip/common/TripModuleHeader";
import { useTripPermissions } from "@/hooks/useTripPermissions";
import TripSettingsView from "@/components/trip/settings/TripSettingsView";

type SettingsPageProps = {
  params: {
    id: string;
  };
};

export default function SettingsPage({ params }: SettingsPageProps) {
  const tripId = params.id;
  const { loading, error, canManageTrip, role } = useTripPermissions(tripId);

  if (loading) {
    return <div className="py-2 text-sm text-slate-600">Cargando permisos...</div>;
  }

  return (
    <div className="space-y-6">
      <TripModuleHeader
        tripId={tripId}
        eyebrow="Configuración"
        title="Ajustes del viaje"
        description="Configura datos generales y opciones del viaje."
      />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!canManageTrip && (
        <ModulePermissionNotice
          title="Ajustes en solo lectura"
          description={`Tu rol actual es ${role}. Solo el owner o quien tenga permiso puede modificar ajustes del viaje.`}
        />
      )}

      <TripSettingsView tripId={tripId} readOnly={!canManageTrip} />
    </div>
  );
}
