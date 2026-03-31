export type TripMapPlaceKind =
  | "visit"
  | "museum"
  | "restaurant"
  | "lodging"
  | "transport"
  | "activity"
  | "general";

export type TripMapLegendItem = {
  id: TripMapPlaceKind;
  label: string;
  emoji: string;
  pillClassName: string;
  markerColor: string;
  markerGlyph: string;
};

export const TRIP_MAP_LEGEND: TripMapLegendItem[] = [
  { id: "visit", label: "Visita", emoji: "📍", pillClassName: "bg-pink-50 text-pink-700 border-pink-200", markerColor: "#ec4899", markerGlyph: "V" },
  { id: "museum", label: "Museo", emoji: "🏛️", pillClassName: "bg-amber-50 text-amber-700 border-amber-200", markerColor: "#d97706", markerGlyph: "M" },
  { id: "restaurant", label: "Restaurante", emoji: "🍽️", pillClassName: "bg-rose-50 text-rose-700 border-rose-200", markerColor: "#e11d48", markerGlyph: "R" },
  { id: "lodging", label: "Alojamiento", emoji: "🏨", pillClassName: "bg-violet-50 text-violet-700 border-violet-200", markerColor: "#7c3aed", markerGlyph: "H" },
  { id: "transport", label: "Transporte", emoji: "🚆", pillClassName: "bg-sky-50 text-sky-700 border-sky-200", markerColor: "#0284c7", markerGlyph: "T" },
  { id: "activity", label: "Actividad", emoji: "🎟️", pillClassName: "bg-emerald-50 text-emerald-700 border-emerald-200", markerColor: "#059669", markerGlyph: "A" },
];

export function normalizePlaceKind(value?: string | null): TripMapPlaceKind {
  const clean = String(value || "").trim().toLowerCase();

  if (["visit", "visita", "place", "sight"].includes(clean)) return "visit";
  if (["museum", "museo"].includes(clean)) return "museum";
  if (["restaurant", "restaurante", "food"].includes(clean)) return "restaurant";
  if (["lodging", "hotel", "alojamiento", "accommodation"].includes(clean)) return "lodging";
  if (["transport", "transporte", "route-stop"].includes(clean)) return "transport";
  if (["activity", "actividad", "general"].includes(clean)) return "activity";
  return "general";
}

export function getLegendItem(kind?: string | null) {
  const normalized = normalizePlaceKind(kind);
  return (
    TRIP_MAP_LEGEND.find((item) => item.id === normalized) ?? {
      id: "general" as const,
      label: "Lugar",
      emoji: "📌",
      pillClassName: "bg-slate-50 text-slate-700 border-slate-200",
      markerColor: "#475569",
      markerGlyph: "•",
    }
  );
}

export function buildGoogleMarkerSymbol(kind?: string | null) {
  const item = getLegendItem(kind);

  return {
    path: "M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z",
    fillColor: item.markerColor,
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeWeight: 1.5,
    scale: 1.7,
    labelOrigin: { x: 12, y: 9 },
  };
}
