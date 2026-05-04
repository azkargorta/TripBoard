import { NextResponse } from "next/server";
import { askGemini } from "@/lib/trip-ai/providers";
import { extractJsonObject } from "@/lib/trip-ai/tripCreationJson";

export const runtime = "nodejs";

type PlaceRow = { name: string; lat: number; lng: number };

// ─── In-process cache (30 min TTL) ───────────────────────────────────────────

const SUGGEST_CACHE = new Map<string, { places: PlaceRow[]; expiresAt: number }>();
const CACHE_TTL = 30 * 60 * 1000;

function cacheGet(key: string): PlaceRow[] | null {
  const entry = SUGGEST_CACHE.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { SUGGEST_CACHE.delete(key); return null; }
  return entry.places;
}
function cacheSet(key: string, places: PlaceRow[]) {
  SUGGEST_CACHE.set(key, { places, expiresAt: Date.now() + CACHE_TTL });
  if (SUGGEST_CACHE.size > 100) {
    const now = Date.now();
    for (const [k, v] of SUGGEST_CACHE.entries()) {
      if (now > v.expiresAt) SUGGEST_CACHE.delete(k);
    }
  }
}

// ─── Layer 1: Curated static list ────────────────────────────────────────────
// Hand-picked tourist destinations per country/region with real coordinates.
// This is the fastest and most reliable source. Covers the most common queries.

type CuratedEntry = { name: string; lat: number; lng: number };

const CURATED: Record<string, CuratedEntry[]> = {
  argentina: [
    { name: "Buenos Aires", lat: -34.6037, lng: -58.3816 },
    { name: "Mendoza", lat: -32.8895, lng: -68.8458 },
    { name: "Bariloche", lat: -41.1335, lng: -71.3103 },
    { name: "Salta", lat: -24.7821, lng: -65.4232 },
    { name: "Iguazú", lat: -25.6953, lng: -54.4367 },
    { name: "Córdoba", lat: -31.4201, lng: -64.1888 },
    { name: "El Calafate", lat: -50.3386, lng: -72.2648 },
    { name: "Ushuaia", lat: -54.8019, lng: -68.3030 },
    { name: "Jujuy", lat: -24.1857, lng: -65.2993 },
    { name: "Mar del Plata", lat: -38.0023, lng: -57.5575 },
    { name: "Rosario", lat: -32.9442, lng: -60.6505 },
    { name: "Tucumán", lat: -26.8241, lng: -65.2226 },
    { name: "Puerto Madryn", lat: -42.7692, lng: -65.0385 },
    { name: "Mendoza (Valle de Uco)", lat: -33.5850, lng: -69.2167 },
    { name: "San Martín de los Andes", lat: -40.1572, lng: -71.3531 },
    { name: "Villa La Angostura", lat: -40.7539, lng: -71.6458 },
    { name: "El Chaltén", lat: -49.3306, lng: -72.8864 },
    { name: "Tilcara", lat: -23.5774, lng: -65.3975 },
    { name: "Colonia del Sacramento", lat: -34.4626, lng: -57.8400 },
    { name: "Neuquén", lat: -38.9516, lng: -68.0591 },
  ],
  españa: [
    { name: "Madrid", lat: 40.4168, lng: -3.7038 },
    { name: "Barcelona", lat: 41.3851, lng: 2.1734 },
    { name: "Sevilla", lat: 37.3891, lng: -5.9845 },
    { name: "Granada", lat: 37.1773, lng: -3.5986 },
    { name: "Valencia", lat: 39.4699, lng: -0.3763 },
    { name: "Bilbao", lat: 43.2630, lng: -2.9350 },
    { name: "San Sebastián", lat: 43.3183, lng: -1.9812 },
    { name: "Mallorca", lat: 39.6953, lng: 3.0176 },
    { name: "Tenerife", lat: 28.2916, lng: -16.6291 },
    { name: "Málaga", lat: 36.7213, lng: -4.4214 },
    { name: "Córdoba", lat: 37.8882, lng: -4.7794 },
    { name: "Toledo", lat: 39.8628, lng: -4.0273 },
    { name: "Santiago de Compostela", lat: 42.8782, lng: -8.5448 },
    { name: "Salamanca", lat: 40.9701, lng: -5.6635 },
    { name: "Cádiz", lat: 36.5271, lng: -6.2886 },
    { name: "Ibiza", lat: 38.9067, lng: 1.4206 },
    { name: "Lanzarote", lat: 28.9637, lng: -13.5470 },
    { name: "Menorca", lat: 40.0000, lng: 4.0000 },
    { name: "Gijón", lat: 43.5453, lng: -5.6620 },
    { name: "Alicante", lat: 38.3452, lng: -0.4815 },
  ],
  spain: [
    { name: "Madrid", lat: 40.4168, lng: -3.7038 },
    { name: "Barcelona", lat: 41.3851, lng: 2.1734 },
    { name: "Sevilla", lat: 37.3891, lng: -5.9845 },
    { name: "Granada", lat: 37.1773, lng: -3.5986 },
    { name: "Valencia", lat: 39.4699, lng: -0.3763 },
    { name: "Bilbao", lat: 43.2630, lng: -2.9350 },
    { name: "San Sebastián", lat: 43.3183, lng: -1.9812 },
    { name: "Mallorca", lat: 39.6953, lng: 3.0176 },
    { name: "Málaga", lat: 36.7213, lng: -4.4214 },
    { name: "Córdoba", lat: 37.8882, lng: -4.7794 },
    { name: "Toledo", lat: 39.8628, lng: -4.0273 },
    { name: "Santiago de Compostela", lat: 42.8782, lng: -8.5448 },
    { name: "Salamanca", lat: 40.9701, lng: -5.6635 },
    { name: "Tenerife", lat: 28.2916, lng: -16.6291 },
    { name: "Cádiz", lat: 36.5271, lng: -6.2886 },
    { name: "Ibiza", lat: 38.9067, lng: 1.4206 },
  ],
  italia: [
    { name: "Roma", lat: 41.9028, lng: 12.4964 },
    { name: "Florencia", lat: 43.7696, lng: 11.2558 },
    { name: "Venecia", lat: 45.4408, lng: 12.3155 },
    { name: "Milán", lat: 45.4654, lng: 9.1866 },
    { name: "Nápoles", lat: 40.8518, lng: 14.2681 },
    { name: "Cinque Terre", lat: 44.1461, lng: 9.6439 },
    { name: "Amalfi", lat: 40.6340, lng: 14.6027 },
    { name: "Sicilia (Palermo)", lat: 38.1157, lng: 13.3615 },
    { name: "Cerdeña (Cagliari)", lat: 39.2238, lng: 9.1217 },
    { name: "Bolonia", lat: 44.4949, lng: 11.3426 },
    { name: "Turín", lat: 45.0703, lng: 7.6869 },
    { name: "Verona", lat: 45.4384, lng: 10.9916 },
    { name: "Positano", lat: 40.6281, lng: 14.4840 },
    { name: "Siena", lat: 43.3186, lng: 11.3307 },
    { name: "Bari", lat: 41.1171, lng: 16.8719 },
    { name: "Pompeya", lat: 40.7462, lng: 14.4989 },
    { name: "Lago de Como", lat: 45.9800, lng: 9.2550 },
    { name: "Capri", lat: 40.5531, lng: 14.2426 },
  ],
  italy: [
    { name: "Rome", lat: 41.9028, lng: 12.4964 },
    { name: "Florence", lat: 43.7696, lng: 11.2558 },
    { name: "Venice", lat: 45.4408, lng: 12.3155 },
    { name: "Milan", lat: 45.4654, lng: 9.1866 },
    { name: "Naples", lat: 40.8518, lng: 14.2681 },
    { name: "Cinque Terre", lat: 44.1461, lng: 9.6439 },
    { name: "Amalfi Coast", lat: 40.6340, lng: 14.6027 },
    { name: "Sicily (Palermo)", lat: 38.1157, lng: 13.3615 },
    { name: "Sardinia (Cagliari)", lat: 39.2238, lng: 9.1217 },
    { name: "Bologna", lat: 44.4949, lng: 11.3426 },
    { name: "Turin", lat: 45.0703, lng: 7.6869 },
    { name: "Verona", lat: 45.4384, lng: 10.9916 },
    { name: "Positano", lat: 40.6281, lng: 14.4840 },
    { name: "Lake Como", lat: 45.9800, lng: 9.2550 },
  ],
  "japón": [
    { name: "Tokio", lat: 35.6762, lng: 139.6503 },
    { name: "Kioto", lat: 35.0116, lng: 135.7681 },
    { name: "Osaka", lat: 34.6937, lng: 135.5023 },
    { name: "Hiroshima", lat: 34.3853, lng: 132.4553 },
    { name: "Nara", lat: 34.6851, lng: 135.8048 },
    { name: "Hakone", lat: 35.2330, lng: 139.1069 },
    { name: "Nikko", lat: 36.7488, lng: 139.5990 },
    { name: "Sapporo", lat: 43.0618, lng: 141.3545 },
    { name: "Fukuoka", lat: 33.5904, lng: 130.4017 },
    { name: "Kanazawa", lat: 36.5613, lng: 136.6562 },
    { name: "Kamakura", lat: 35.3192, lng: 139.5467 },
    { name: "Okinawa (Naha)", lat: 26.2124, lng: 127.6809 },
    { name: "Miyajima", lat: 34.2957, lng: 132.3196 },
    { name: "Sendai", lat: 38.2682, lng: 140.8694 },
  ],
  japan: [
    { name: "Tokyo", lat: 35.6762, lng: 139.6503 },
    { name: "Kyoto", lat: 35.0116, lng: 135.7681 },
    { name: "Osaka", lat: 34.6937, lng: 135.5023 },
    { name: "Hiroshima", lat: 34.3853, lng: 132.4553 },
    { name: "Nara", lat: 34.6851, lng: 135.8048 },
    { name: "Hakone", lat: 35.2330, lng: 139.1069 },
    { name: "Sapporo", lat: 43.0618, lng: 141.3545 },
    { name: "Fukuoka", lat: 33.5904, lng: 130.4017 },
    { name: "Kanazawa", lat: 36.5613, lng: 136.6562 },
    { name: "Kamakura", lat: 35.3192, lng: 139.5467 },
    { name: "Okinawa", lat: 26.2124, lng: 127.6809 },
  ],
  francia: [
    { name: "París", lat: 48.8566, lng: 2.3522 },
    { name: "Marsella", lat: 43.2965, lng: 5.3698 },
    { name: "Lyon", lat: 45.7640, lng: 4.8357 },
    { name: "Niza", lat: 43.7102, lng: 7.2620 },
    { name: "Burdeos", lat: 44.8378, lng: -0.5792 },
    { name: "Estrasburgo", lat: 48.5734, lng: 7.7521 },
    { name: "Mont Saint-Michel", lat: 48.6361, lng: -1.5115 },
    { name: "Carcasona", lat: 43.2130, lng: 2.3491 },
    { name: "Versalles", lat: 48.8014, lng: 2.1301 },
    { name: "Bretaña (Rennes)", lat: 48.1173, lng: -1.6778 },
    { name: "Normandía (Caen)", lat: 49.1829, lng: -0.3707 },
    { name: "Costa Azul (Cannes)", lat: 43.5528, lng: 7.0174 },
    { name: "Provenza (Aix-en-Provence)", lat: 43.5297, lng: 5.4474 },
    { name: "Chamonix", lat: 45.9237, lng: 6.8694 },
  ],
  france: [
    { name: "Paris", lat: 48.8566, lng: 2.3522 },
    { name: "Marseille", lat: 43.2965, lng: 5.3698 },
    { name: "Lyon", lat: 45.7640, lng: 4.8357 },
    { name: "Nice", lat: 43.7102, lng: 7.2620 },
    { name: "Bordeaux", lat: 44.8378, lng: -0.5792 },
    { name: "Strasbourg", lat: 48.5734, lng: 7.7521 },
    { name: "Mont Saint-Michel", lat: 48.6361, lng: -1.5115 },
    { name: "Carcassonne", lat: 43.2130, lng: 2.3491 },
    { name: "Versailles", lat: 48.8014, lng: 2.1301 },
    { name: "Provence (Aix-en-Provence)", lat: 43.5297, lng: 5.4474 },
    { name: "Chamonix", lat: 45.9237, lng: 6.8694 },
  ],
  grecia: [
    { name: "Atenas", lat: 37.9838, lng: 23.7275 },
    { name: "Santorini", lat: 36.3932, lng: 25.4615 },
    { name: "Mykonos", lat: 37.4467, lng: 25.3289 },
    { name: "Creta (Heraclión)", lat: 35.3387, lng: 25.1442 },
    { name: "Rodas", lat: 36.4341, lng: 28.2176 },
    { name: "Meteora", lat: 39.7217, lng: 21.6306 },
    { name: "Tesalónica", lat: 40.6401, lng: 22.9444 },
    { name: "Corfu", lat: 39.6243, lng: 19.9217 },
    { name: "Delfos", lat: 38.4824, lng: 22.5010 },
    { name: "Corfú (ciudad)", lat: 39.6243, lng: 19.9217 },
    { name: "Nafplio", lat: 37.5675, lng: 22.8016 },
  ],
  greece: [
    { name: "Athens", lat: 37.9838, lng: 23.7275 },
    { name: "Santorini", lat: 36.3932, lng: 25.4615 },
    { name: "Mykonos", lat: 37.4467, lng: 25.3289 },
    { name: "Crete (Heraklion)", lat: 35.3387, lng: 25.1442 },
    { name: "Rhodes", lat: 36.4341, lng: 28.2176 },
    { name: "Meteora", lat: 39.7217, lng: 21.6306 },
    { name: "Thessaloniki", lat: 40.6401, lng: 22.9444 },
    { name: "Corfu", lat: 39.6243, lng: 19.9217 },
    { name: "Delphi", lat: 38.4824, lng: 22.5010 },
  ],
  portugal: [
    { name: "Lisboa", lat: 38.7223, lng: -9.1393 },
    { name: "Oporto", lat: 41.1579, lng: -8.6291 },
    { name: "Algarve (Faro)", lat: 37.0194, lng: -7.9322 },
    { name: "Sintra", lat: 38.7985, lng: -9.3874 },
    { name: "Évora", lat: 38.5752, lng: -7.9088 },
    { name: "Douro Valley", lat: 41.1579, lng: -7.9088 },
    { name: "Madeira (Funchal)", lat: 32.6669, lng: -16.9241 },
    { name: "Azores (Ponta Delgada)", lat: 37.7412, lng: -25.6756 },
    { name: "Óbidos", lat: 39.3617, lng: -9.1574 },
    { name: "Coimbra", lat: 40.2033, lng: -8.4103 },
    { name: "Braga", lat: 41.5454, lng: -8.4265 },
    { name: "Lagos", lat: 37.1025, lng: -8.6743 },
  ],
  marruecos: [
    { name: "Marrakech", lat: 31.6295, lng: -7.9811 },
    { name: "Fez", lat: 34.0181, lng: -5.0078 },
    { name: "Casablanca", lat: 33.5731, lng: -7.5898 },
    { name: "Rabat", lat: 34.0209, lng: -6.8416 },
    { name: "Chefchaouen", lat: 35.1688, lng: -5.2636 },
    { name: "Merzouga (Desierto)", lat: 31.0978, lng: -4.0133 },
    { name: "Essaouira", lat: 31.5085, lng: -9.7595 },
    { name: "Meknès", lat: 33.8935, lng: -5.5473 },
    { name: "Agadir", lat: 30.4278, lng: -9.5981 },
    { name: "Tánger", lat: 35.7595, lng: -5.8340 },
    { name: "Aït-Ben-Haddou", lat: 31.0471, lng: -7.1306 },
    { name: "Ouarzazate", lat: 30.9335, lng: -6.9370 },
  ],
  morocco: [
    { name: "Marrakech", lat: 31.6295, lng: -7.9811 },
    { name: "Fes", lat: 34.0181, lng: -5.0078 },
    { name: "Casablanca", lat: 33.5731, lng: -7.5898 },
    { name: "Chefchaouen", lat: 35.1688, lng: -5.2636 },
    { name: "Merzouga (Sahara)", lat: 31.0978, lng: -4.0133 },
    { name: "Essaouira", lat: 31.5085, lng: -9.7595 },
    { name: "Agadir", lat: 30.4278, lng: -9.5981 },
  ],
  tailandia: [
    { name: "Bangkok", lat: 13.7563, lng: 100.5018 },
    { name: "Chiang Mai", lat: 18.7883, lng: 98.9853 },
    { name: "Phuket", lat: 7.8804, lng: 98.3923 },
    { name: "Koh Samui", lat: 9.5120, lng: 100.0136 },
    { name: "Krabi", lat: 8.0863, lng: 98.9063 },
    { name: "Ayutthaya", lat: 14.3532, lng: 100.5673 },
    { name: "Kanchanaburi", lat: 14.0227, lng: 99.5328 },
    { name: "Pai", lat: 19.3589, lng: 98.4396 },
    { name: "Koh Phi Phi", lat: 7.7407, lng: 98.7784 },
    { name: "Chiang Rai", lat: 19.9105, lng: 99.8406 },
  ],
  thailand: [
    { name: "Bangkok", lat: 13.7563, lng: 100.5018 },
    { name: "Chiang Mai", lat: 18.7883, lng: 98.9853 },
    { name: "Phuket", lat: 7.8804, lng: 98.3923 },
    { name: "Koh Samui", lat: 9.5120, lng: 100.0136 },
    { name: "Krabi", lat: 8.0863, lng: 98.9063 },
    { name: "Ayutthaya", lat: 14.3532, lng: 100.5673 },
    { name: "Chiang Rai", lat: 19.9105, lng: 99.8406 },
  ],
  mexico: [
    { name: "Ciudad de México", lat: 19.4326, lng: -99.1332 },
    { name: "Cancún", lat: 21.1619, lng: -86.8515 },
    { name: "Oaxaca", lat: 17.0669, lng: -96.7203 },
    { name: "San Cristóbal de las Casas", lat: 16.7370, lng: -92.6376 },
    { name: "Playa del Carmen", lat: 20.6296, lng: -87.0739 },
    { name: "Mérida", lat: 20.9674, lng: -89.5926 },
    { name: "Guadalajara", lat: 20.6597, lng: -103.3496 },
    { name: "Tulum", lat: 20.2114, lng: -87.4654 },
    { name: "Puerto Vallarta", lat: 20.6534, lng: -105.2253 },
    { name: "Guanajuato", lat: 21.0190, lng: -101.2574 },
    { name: "Puebla", lat: 19.0414, lng: -98.2063 },
    { name: "Teotihuacán", lat: 19.6925, lng: -98.8438 },
    { name: "Chihuahua", lat: 28.6329, lng: -106.0691 },
    { name: "Los Cabos", lat: 22.8905, lng: -109.9167 },
  ],
  "méxico": [
    { name: "Ciudad de México", lat: 19.4326, lng: -99.1332 },
    { name: "Cancún", lat: 21.1619, lng: -86.8515 },
    { name: "Oaxaca", lat: 17.0669, lng: -96.7203 },
    { name: "San Cristóbal de las Casas", lat: 16.7370, lng: -92.6376 },
    { name: "Playa del Carmen", lat: 20.6296, lng: -87.0739 },
    { name: "Mérida", lat: 20.9674, lng: -89.5926 },
    { name: "Guadalajara", lat: 20.6597, lng: -103.3496 },
    { name: "Tulum", lat: 20.2114, lng: -87.4654 },
    { name: "Puerto Vallarta", lat: 20.6534, lng: -105.2253 },
    { name: "Guanajuato", lat: 21.0190, lng: -101.2574 },
    { name: "Puebla", lat: 19.0414, lng: -98.2063 },
    { name: "Los Cabos", lat: 22.8905, lng: -109.9167 },
  ],
  peru: [
    { name: "Lima", lat: -12.0464, lng: -77.0428 },
    { name: "Cusco", lat: -13.5320, lng: -71.9675 },
    { name: "Machu Picchu", lat: -13.1631, lng: -72.5450 },
    { name: "Arequipa", lat: -16.4090, lng: -71.5375 },
    { name: "Puno", lat: -15.8402, lng: -70.0219 },
    { name: "Lago Titicaca", lat: -15.9254, lng: -69.3354 },
    { name: "Iquitos", lat: -3.7437, lng: -73.2516 },
    { name: "Trujillo", lat: -8.1091, lng: -79.0215 },
    { name: "Nazca", lat: -14.8294, lng: -74.9390 },
    { name: "Huaraz", lat: -9.5270, lng: -77.5280 },
    { name: "Mancora", lat: -4.1059, lng: -81.0426 },
  ],
  "perú": [
    { name: "Lima", lat: -12.0464, lng: -77.0428 },
    { name: "Cusco", lat: -13.5320, lng: -71.9675 },
    { name: "Machu Picchu", lat: -13.1631, lng: -72.5450 },
    { name: "Arequipa", lat: -16.4090, lng: -71.5375 },
    { name: "Puno", lat: -15.8402, lng: -70.0219 },
    { name: "Lago Titicaca", lat: -15.9254, lng: -69.3354 },
    { name: "Iquitos", lat: -3.7437, lng: -73.2516 },
    { name: "Nazca", lat: -14.8294, lng: -74.9390 },
    { name: "Huaraz", lat: -9.5270, lng: -77.5280 },
  ],
  colombia: [
    { name: "Bogotá", lat: 4.7110, lng: -74.0721 },
    { name: "Cartagena", lat: 10.3910, lng: -75.4794 },
    { name: "Medellín", lat: 6.2442, lng: -75.5812 },
    { name: "Santa Marta", lat: 11.2408, lng: -74.1990 },
    { name: "Cali", lat: 3.4516, lng: -76.5320 },
    { name: "Villa de Leyva", lat: 5.6356, lng: -73.5244 },
    { name: "Salento", lat: 4.6376, lng: -75.5712 },
    { name: "San Andrés", lat: 12.5847, lng: -81.7006 },
    { name: "Tayrona (Santa Marta)", lat: 11.3080, lng: -73.9250 },
    { name: "Manizales", lat: 5.0703, lng: -75.5138 },
  ],
  chile: [
    { name: "Santiago", lat: -33.4489, lng: -70.6693 },
    { name: "Patagonia (Punta Arenas)", lat: -53.1638, lng: -70.9171 },
    { name: "Atacama (San Pedro)", lat: -22.9087, lng: -68.1997 },
    { name: "Valparaíso", lat: -33.0472, lng: -71.6127 },
    { name: "Torres del Paine", lat: -51.0000, lng: -73.0000 },
    { name: "Puerto Natales", lat: -51.7317, lng: -72.4904 },
    { name: "Viña del Mar", lat: -33.0245, lng: -71.5518 },
    { name: "Pucón", lat: -39.2720, lng: -71.9778 },
    { name: "Puerto Varas", lat: -41.3190, lng: -72.9878 },
    { name: "Chiloé (Castro)", lat: -42.4814, lng: -73.7630 },
    { name: "Isla de Pascua", lat: -27.1127, lng: -109.3497 },
  ],
  brasil: [
    { name: "Río de Janeiro", lat: -22.9068, lng: -43.1729 },
    { name: "São Paulo", lat: -23.5505, lng: -46.6333 },
    { name: "Salvador de Bahía", lat: -12.9714, lng: -38.5014 },
    { name: "Foz do Iguaçu", lat: -25.5163, lng: -54.5854 },
    { name: "Florianópolis", lat: -27.5954, lng: -48.5480 },
    { name: "Fortaleza", lat: -3.7172, lng: -38.5433 },
    { name: "Manaus (Amazonas)", lat: -3.1190, lng: -60.0217 },
    { name: "Recife", lat: -8.0476, lng: -34.8770 },
    { name: "Paraty", lat: -23.2178, lng: -44.7132 },
    { name: "Bonito", lat: -21.1261, lng: -56.4836 },
    { name: "Lençóis Maranhenses", lat: -2.4780, lng: -43.1200 },
    { name: "Búzios", lat: -22.7460, lng: -41.8827 },
  ],
  brazil: [
    { name: "Rio de Janeiro", lat: -22.9068, lng: -43.1729 },
    { name: "São Paulo", lat: -23.5505, lng: -46.6333 },
    { name: "Salvador (Bahia)", lat: -12.9714, lng: -38.5014 },
    { name: "Iguazu Falls", lat: -25.5163, lng: -54.5854 },
    { name: "Florianópolis", lat: -27.5954, lng: -48.5480 },
    { name: "Fortaleza", lat: -3.7172, lng: -38.5433 },
    { name: "Manaus (Amazon)", lat: -3.1190, lng: -60.0217 },
    { name: "Paraty", lat: -23.2178, lng: -44.7132 },
  ],
  turquia: [
    { name: "Estambul", lat: 41.0082, lng: 28.9784 },
    { name: "Capadocia (Göreme)", lat: 38.6431, lng: 34.8289 },
    { name: "Antalya", lat: 36.8969, lng: 30.7133 },
    { name: "Éfeso (Selçuk)", lat: 37.9395, lng: 27.3411 },
    { name: "Pamukkale", lat: 37.9204, lng: 29.1204 },
    { name: "Bodrum", lat: 37.0344, lng: 27.4305 },
    { name: "Esmirna", lat: 38.4192, lng: 27.1287 },
    { name: "Ankara", lat: 39.9334, lng: 32.8597 },
    { name: "Konya", lat: 37.8746, lng: 32.4932 },
    { name: "Costa del Egeo (Marmaris)", lat: 36.8556, lng: 28.2716 },
  ],
  turkey: [
    { name: "Istanbul", lat: 41.0082, lng: 28.9784 },
    { name: "Cappadocia (Göreme)", lat: 38.6431, lng: 34.8289 },
    { name: "Antalya", lat: 36.8969, lng: 30.7133 },
    { name: "Ephesus (Selçuk)", lat: 37.9395, lng: 27.3411 },
    { name: "Pamukkale", lat: 37.9204, lng: 29.1204 },
    { name: "Bodrum", lat: 37.0344, lng: 27.4305 },
  ],
};

// Normalize query to match curated keys
function normalizeCuratedKey(q: string): string {
  return q.trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/\s+/g, " ");
}

// Try curated list first — returns null if no match
function getCuratedPlaces(query: string, limit: number, offset: number): PlaceRow[] | null {
  const key = normalizeCuratedKey(query);
  // Direct match
  for (const [k, places] of Object.entries(CURATED)) {
    const normalizedKey = normalizeCuratedKey(k);
    if (normalizedKey === key) {
      return places.slice(offset, offset + limit);
    }
  }
  // Partial match (e.g. "argentina" matches "argentina")
  for (const [k, places] of Object.entries(CURATED)) {
    const normalizedKey = normalizeCuratedKey(k);
    if (normalizedKey.includes(key) || key.includes(normalizedKey)) {
      return places.slice(offset, offset + limit);
    }
  }
  return null;
}

// ─── Layer 2: Overpass ────────────────────────────────────────────────────────

function dedupeByName(rows: PlaceRow[]): PlaceRow[] {
  const seen = new Set<string>();
  const out: PlaceRow[] = [];
  for (const r of rows) {
    const key = String(r.name || "").trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

async function fetchOverpassJson(query: string, timeoutMs: number): Promise<any | null> {
  const endpoints = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.openstreetmap.ru/api/interpreter",
  ];
  const body = `data=${encodeURIComponent(query)}`;
  for (const url of endpoints) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body, cache: "no-store", signal: ctrl.signal,
      });
      const json: any = await resp.json().catch(() => null);
      if (resp.ok && json) return json;
    } catch {
      // try next mirror
    } finally {
      clearTimeout(t);
    }
  }
  return null;
}

async function photonCountryOsmRelationId(countryName: string): Promise<number | null> {
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", countryName);
  url.searchParams.set("limit", "8");
  try {
    const resp = await fetch(url.toString(), { cache: "no-store" });
    const payload: any = await resp.json().catch(() => null);
    if (!resp.ok) return null;
    for (const f of (Array.isArray(payload?.features) ? payload.features : [])) {
      const p = f?.properties || {};
      if (String(p?.osm_type || "").toLowerCase() !== "r") continue;
      const osmId = Number(p?.osm_id);
      if (!Number.isFinite(osmId)) continue;
      if (String(p?.type || "").toLowerCase() === "country" || String(p?.osm_value || "").toLowerCase() === "country") {
        return osmId;
      }
    }
  } catch { /* ignore */ }
  return null;
}

function parseOverpassPlaces(payload: any): PlaceRow[] {
  const rows: PlaceRow[] = [];
  for (const el of (Array.isArray(payload?.elements) ? payload.elements : [])) {
    const tags = el?.tags || {};
    const name = typeof tags?.name === "string" ? tags.name.trim() : "";
    const lat = typeof el?.lat === "number" ? el.lat : el?.center?.lat ?? null;
    const lng = typeof el?.lon === "number" ? el.lon : el?.center?.lon ?? null;
    if (!name || lat == null || lng == null) continue;
    rows.push({ name, lat, lng });
  }
  return dedupeByName(rows);
}

async function getOverpassPlaces(query: string, limit: number, offset: number): Promise<PlaceRow[] | null> {
  const outLimit = Math.max(400, (limit + offset) * 30);
  // Try by country name
  const q1 = `[out:json][timeout:40];\narea["name"="${query}"]["boundary"="administrative"]["admin_level"="2"]->.a;\n(node["place"="city"](area.a);way["place"="city"](area.a);node["place"="town"](area.a);way["place"="town"](area.a););\nout center tags ${outLimit};`;
  const p1 = await fetchOverpassJson(q1, 35_000);
  if (p1) {
    const rows = parseOverpassPlaces(p1);
    if (rows.length >= 5) return rows.slice(offset, offset + limit);
  }
  // Try by OSM relation ID
  const relId = await photonCountryOsmRelationId(query);
  if (relId) {
    const areaId = 3600000000 + relId;
    const q2 = `[out:json][timeout:40];\n(node["place"="city"](area:${areaId});way["place"="city"](area:${areaId});node["place"="town"](area:${areaId}););\nout center tags ${outLimit};`;
    const p2 = await fetchOverpassJson(q2, 35_000);
    if (p2) {
      const rows = parseOverpassPlaces(p2);
      if (rows.length >= 3) return rows.slice(offset, offset + limit);
    }
  }
  return null;
}

// ─── Layer 3: Gemini fallback ─────────────────────────────────────────────────

async function getGeminiPlaces(query: string, limit: number): Promise<PlaceRow[] | null> {
  const prompt = `Lista los ${limit} destinos turísticos más importantes y visitados de "${query}".
Devuelve SOLO un array JSON válido (sin markdown, sin texto extra):
[{"name":"...","lat":0.0,"lng":0.0}, ...]

Reglas:
- Solo ciudades, pueblos o regiones REALES y concretas de "${query}".
- Ordena de más a menos turístico/conocido.
- Coordenadas lat/lng reales y precisas del centro de cada lugar.
- Mínimo ${Math.min(limit, 15)} lugares.
- PROHIBIDO: países completos, nombres de países, nombres inventados.`;

  try {
    const raw = await askGemini(prompt, "planning", { maxOutputTokens: 1024 });
    // Extract array from response
    const text = raw.trim().replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    const startArr = text.indexOf("[");
    const endArr = text.lastIndexOf("]");
    if (startArr < 0 || endArr <= startArr) return null;
    const arr = JSON.parse(text.slice(startArr, endArr + 1));
    if (!Array.isArray(arr)) return null;
    const places: PlaceRow[] = arr
      .map((item: any) => {
        const name = String(item?.name || "").trim();
        const lat = typeof item?.lat === "number" ? item.lat : null;
        const lng = typeof item?.lng === "number" ? item.lng : null;
        if (!name || lat === null || lng === null) return null;
        if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
        return { name, lat, lng };
      })
      .filter(Boolean) as PlaceRow[];
    return dedupeByName(places).slice(0, limit);
  } catch {
    return null;
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const query = String(body?.query || "").trim();
    const limit = Math.min(Number(body?.limit) || 18, 40);
    const offset = Number(body?.offset) || 0;
    if (!query) return NextResponse.json({ error: "Falta query." }, { status: 400 });

    const cacheKey = `${query.toLowerCase()}:${limit}:${offset}`;
    const cached = cacheGet(cacheKey);
    if (cached) return NextResponse.json({ ok: true, places: cached, source: "cache" });

    // ── Layer 1: Curated static list (instant, always works) ─────────────────
    const curated = getCuratedPlaces(query, limit, offset);
    if (curated && curated.length >= 5) {
      // If we have enough curated results, return immediately
      // For offset > 0 (pagination), supplement with Gemini if curated runs out
      if (offset === 0 || curated.length >= 3) {
        cacheSet(cacheKey, curated);
        return NextResponse.json({ ok: true, places: curated, source: "curated" });
      }
    }

    // ── Layer 2: Overpass (only if curated had no match) ─────────────────────
    if (!curated || curated.length < 3) {
      const overpassPlaces = await getOverpassPlaces(query, limit, offset);
      if (overpassPlaces && overpassPlaces.length >= 5) {
        cacheSet(cacheKey, overpassPlaces);
        return NextResponse.json({ ok: true, places: overpassPlaces, source: "overpass" });
      }
    }

    // ── Layer 3: Gemini fallback (when curated has no match AND Overpass fails) 
    const geminiPlaces = await getGeminiPlaces(query, limit + offset);
    if (geminiPlaces && geminiPlaces.length > 0) {
      const sliced = geminiPlaces.slice(offset, offset + limit);
      cacheSet(cacheKey, sliced);
      return NextResponse.json({ ok: true, places: sliced, source: "gemini" });
    }

    // Return curated even if small, or empty
    const fallback = curated || [];
    return NextResponse.json({ ok: true, places: fallback, source: "fallback" });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo sugerir lugares." },
      { status: 500 }
    );
  }
}
