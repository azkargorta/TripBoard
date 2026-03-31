import { detectDocumentType, detectProviderSlug, parseDocumentByProvider } from "@/lib/document-parsers";
import type { DetectedDocumentData } from "@/lib/document-parsers/types";

export type { DetectedDocumentData } from "@/lib/document-parsers/types";
export type { DetectedDocumentType } from "@/lib/document-parsers/types";

export function analyzeDocumentText(extractedText: string, fileName?: string | null): DetectedDocumentData {
  const parsed = parseDocumentByProvider({ extractedText, fileName });
  const documentType = parsed.documentType || detectDocumentType(extractedText, fileName);
  const providerSlug = parsed.providerSlug || detectProviderSlug(extractedText, fileName) || null;

  let confidence = 0.2;
  if ((extractedText || "").trim().length > 30) confidence = 0.45;
  if (providerSlug) confidence += 0.2;
  if (parsed.providerName || parsed.reservationName) confidence += 0.1;
  if (parsed.reservationCode) confidence += 0.1;
  if (parsed.totalAmount != null) confidence += 0.1;
  if (parsed.address || parsed.location || parsed.destination) confidence += 0.1;
  confidence = Math.min(confidence, 0.97);

  return {
    documentType,
    confidence,
    extractedText: extractedText || "",
    providerSlug,
    fileName: fileName || null,
    providerName: parsed.providerName || null,
    reservationName: parsed.reservationName || parsed.providerName || null,
    reservationCode: parsed.reservationCode || null,
    address: parsed.address || null,
    city: parsed.city || null,
    country: parsed.country || null,
    checkInDate: parsed.checkInDate || null,
    checkInTime: parsed.checkInTime || null,
    checkOutDate: parsed.checkOutDate || null,
    checkOutTime: parsed.checkOutTime || null,
    guests: parsed.guests ?? null,
    totalAmount: parsed.totalAmount ?? null,
    currency: parsed.currency || null,
    paymentStatus: parsed.paymentStatus || null,
    notes: parsed.notes || null,
    latitude: parsed.latitude ?? null,
    longitude: parsed.longitude ?? null,
    origin: parsed.origin || null,
    destination: parsed.destination || null,
    departureDate: parsed.departureDate || null,
    departureTime: parsed.departureTime || null,
    arrivalDate: parsed.arrivalDate || null,
    arrivalTime: parsed.arrivalTime || null,
    passengers: parsed.passengers ?? null,
    transportType: parsed.transportType || null,
    seat: parsed.seat || null,
    terminal: parsed.terminal || null,
    gate: parsed.gate || null,
    location: parsed.location || null,
    activityDate: parsed.activityDate || null,
    activityTime: parsed.activityTime || null,
    participants: parsed.participants ?? null,
    duration: parsed.duration || null,
    meetingPoint: parsed.meetingPoint || null,
    language: parsed.language || null,
  };
}
