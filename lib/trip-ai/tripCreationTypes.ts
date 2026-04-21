/**
 * Intención estructurada para creación automática de viaje (sin depender del historial de chat).
 */
export type TripCreationIntent = {
  destination?: string | null;
  /** Ciudad o punto de inicio del viaje si el usuario lo menciona (opcional). */
  startLocation?: string | null;
  /** Ciudad o punto final del viaje si el usuario lo menciona (opcional). */
  endLocation?: string | null;
  durationDays?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  travelersCount?: number | null;
  travelersType?: "solo" | "couple" | "friends" | "family" | null;
  budgetLevel?: "low" | "medium" | "high" | null;
  interests?: string[];
  travelStyle?: string[];
  constraints?: string[];
  /** Sitios/paradas que el usuario quiere sí o sí (opcional). */
  mustSee?: string[];
  wantsRouteOptimization?: boolean;
  wantsBudgetPlan?: boolean;
  /** Nombre sugerido para el viaje (opcional; el servidor puede derivar uno). */
  suggestedTripName?: string | null;
};

export type TripCreationFollowUp = {
  code: "destination" | "duration_or_dates";
  question: string;
};

export type ItineraryItemPayload = {
  title: string;
  activity_kind?: string | null;
  place_name?: string | null;
  address?: string | null;
  start_time?: string | null;
  notes?: string | null;
};

export type ItineraryDayPayload = {
  day: number;
  date: string | null;
  items: ItineraryItemPayload[];
};

/** Mismo contrato que execute-plan / asistente. */
export type ExecutableItineraryPayload = {
  version: 1;
  title?: string;
  travelMode?: "driving" | "walking" | "cycling";
  days: ItineraryDayPayload[];
};
