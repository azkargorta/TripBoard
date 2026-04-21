import type { TripCreationFollowUp, TripCreationIntent } from "@/lib/trip-ai/tripCreationTypes";
import { addDaysIso, daysBetweenInclusive, defaultTripStartDate, isIsoDate } from "@/lib/trip-ai/tripCreationDates";

const MAX_AUTO_DAYS = 14;

export function mergeTripCreationIntent(base: TripCreationIntent, patch: TripCreationIntent): TripCreationIntent {
  const out: TripCreationIntent = { ...base };
  (Object.keys(patch) as (keyof TripCreationIntent)[]).forEach((k) => {
    const v = patch[k];
    if (v === undefined) return;
    if (v === null && typeof (out as any)[k] === "string" && String((out as any)[k]).trim()) {
      return;
    }
    if (k === "interests" || k === "travelStyle" || k === "constraints" || k === "mustSee") {
      const prev = (out[k] as string[] | undefined) || [];
      const next = (v as string[] | undefined) || [];
      const merged = [...new Set([...prev, ...next].map((s) => String(s || "").trim()).filter(Boolean))];
      (out as any)[k] = merged.length ? merged : undefined;
    } else {
      (out as any)[k] = v;
    }
  });
  return out;
}

export function getTripCreationFollowUp(intent: TripCreationIntent): TripCreationFollowUp | null {
  const dest = typeof intent.destination === "string" && intent.destination.trim();
  if (!dest) {
    return {
      code: "destination",
      question: "¿A qué destino o ciudad vais? (con el nombre basta)",
    };
  }

  const dur = typeof intent.durationDays === "number" && Number.isFinite(intent.durationDays) ? Math.round(intent.durationDays) : null;
  const hasDuration = dur != null && dur > 0 && dur <= 30;
  const hasRange = isIsoDate(intent.startDate) && isIsoDate(intent.endDate);
  const hasStartAndDuration = isIsoDate(intent.startDate) && hasDuration;

  if (!hasDuration && !hasRange && !hasStartAndDuration) {
    return {
      code: "duration_or_dates",
      question: "¿Cuántos días dura el viaje? (ej.: 4) O indica fecha de inicio y fin.",
    };
  }
  return null;
}

export type ResolvedTripCreation = {
  destination: string;
  startDate: string;
  endDate: string;
  durationDays: number;
  intent: TripCreationIntent;
};

export function resolveTripCreationDates(intent: TripCreationIntent): ResolvedTripCreation | { error: string } {
  const destination = (intent.destination || "").trim();
  if (!destination) return { error: "Falta destino." };

  let startDate: string | null = isIsoDate(intent.startDate) ? intent.startDate : null;
  let endDate: string | null = isIsoDate(intent.endDate) ? intent.endDate : null;
  let rawDur =
    typeof intent.durationDays === "number" && Number.isFinite(intent.durationDays) ? Math.round(intent.durationDays) : null;

  if (startDate && endDate) {
    if (endDate < startDate) return { error: "La fecha de fin no puede ser anterior al inicio." };
    let durationDays = daysBetweenInclusive(startDate, endDate);
    durationDays = Math.min(MAX_AUTO_DAYS, Math.max(1, durationDays));
    endDate = addDaysIso(startDate, durationDays - 1);
    return {
      destination,
      startDate,
      endDate,
      durationDays,
      intent: { ...intent, destination, startDate, endDate, durationDays },
    };
  }

  if (startDate && rawDur != null && rawDur > 0) {
    let durationDays = Math.min(MAX_AUTO_DAYS, Math.max(1, rawDur));
    endDate = addDaysIso(startDate, durationDays - 1);
    return {
      destination,
      startDate,
      endDate,
      durationDays,
      intent: { ...intent, destination, startDate, endDate, durationDays },
    };
  }

  if (rawDur != null && rawDur > 0) {
    const s = startDate || defaultTripStartDate();
    let durationDays = Math.min(MAX_AUTO_DAYS, Math.max(1, rawDur));
    startDate = s;
    endDate = addDaysIso(s, durationDays - 1);
    return {
      destination,
      startDate,
      endDate,
      durationDays,
      intent: { ...intent, destination, startDate, endDate, durationDays },
    };
  }

  return { error: "No se pudieron resolver fechas o duración." };
}

export function buildDefaultTripName(resolved: ResolvedTripCreation): string {
  const shortDest = resolved.destination.split(",")[0].trim().slice(0, 40);
  return `${shortDest} · ${resolved.durationDays} días`;
}
