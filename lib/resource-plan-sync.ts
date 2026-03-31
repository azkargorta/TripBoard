/**
 * Utilidad opcional para convertir una reserva en un item sincronizable al Plan.
 * Úsala solo si tu backend / hook de recursos necesita un payload unificado.
 */
export function buildPlanSyncPayload(input: {
  title: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  startDate?: string | null;
  startTime?: string | null;
  kind: "lodging" | "transport" | "activity";
}) {
  return {
    syncToPlan: true,
    planSync: {
      title: input.title,
      address: input.address || null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      activityDate: input.startDate || null,
      activityTime: input.startTime || null,
      activityKind: input.kind,
    },
  };
}
