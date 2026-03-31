import type { DetectedDocumentData, ParserContext } from "./types";
import { detectCurrency, pickAllDates, pickBestAmount, pickFirst, pickFirstTime } from "./helpers";

export function parseActivityDocument({ extractedText, fileName }: ParserContext): Partial<DetectedDocumentData> {
  const text = extractedText || "";
  const dates = pickAllDates(text);

  return {
    providerSlug: "activity",
    documentType: "activity_ticket",
    providerName: pickFirst(text, [/(?:provider|organizer|empresa|proveedor)[:\s]+([^\n]+)/i]) || fileName?.replace(/\.[^.]+$/, "") || null,
    reservationName: pickFirst(text, [/(?:activity|tour|visit|museo|museum|entrada|ticket)[:\s]+([^\n]+)/i]) || fileName?.replace(/\.[^.]+$/, "") || "Actividad",
    reservationCode: pickFirst(text, [/(?:reservation|booking|code|ticket no\.?|reference)[:\s#]*([A-Z0-9-]{4,})/i]),
    location: pickFirst(text, [/(?:location|venue|lugar|meeting point|punto de encuentro)[:\s]+([^\n]+)/i]),
    activityDate: dates[0] || null,
    activityTime: pickFirstTime(text, [/(?:time|hora|start time)[:\s]+([^\n]+)/i]),
    participants: Number(pickFirst(text, [/(?:participants|people|adults|guests|viajeros)[:\s]+(\d+)/i]) || "") || null,
    duration: pickFirst(text, [/(?:duration|duraci[oó]n)[:\s]+([^\n]+)/i]),
    meetingPoint: pickFirst(text, [/(?:meeting point|punto de encuentro)[:\s]+([^\n]+)/i]),
    language: pickFirst(text, [/(?:language|idioma)[:\s]+([^\n]+)/i]),
    totalAmount: pickBestAmount(text),
    currency: detectCurrency(text),
  };
}
