export type DetectedDocumentType =
  | "hotel_reservation"
  | "flight_ticket"
  | "boarding_pass"
  | "train_ticket"
  | "rental_car"
  | "activity_ticket"
  | "manual_transport_reservation"
  | "manual_activity_reservation"
  | "unknown";

export type DetectedDocumentData = {
  documentType: DetectedDocumentType;
  confidence: number;
  extractedText: string;
  providerName?: string | null;
  reservationName?: string | null;
  reservationCode?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  checkInDate?: string | null;
  checkInTime?: string | null;
  checkOutDate?: string | null;
  checkOutTime?: string | null;
  guests?: number | null;
  totalAmount?: number | null;
  currency?: string | null;
  paymentStatus?: string | null;
  notes?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  origin?: string | null;
  destination?: string | null;
  departureDate?: string | null;
  departureTime?: string | null;
  arrivalDate?: string | null;
  arrivalTime?: string | null;
  passengers?: number | null;
  transportType?: string | null;
  seat?: string | null;
  terminal?: string | null;
  gate?: string | null;
  location?: string | null;
  activityDate?: string | null;
  activityTime?: string | null;
  participants?: number | null;
  duration?: string | null;
  meetingPoint?: string | null;
  language?: string | null;
  fileName?: string | null;
  providerSlug?: string | null;
};

export type ParserContext = {
  extractedText: string;
  fileName?: string | null;
};
