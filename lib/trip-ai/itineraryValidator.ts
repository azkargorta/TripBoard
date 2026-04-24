import type { ExecutableItineraryPayload } from "@/lib/trip-ai/tripCreationTypes";
import type { TripAutoGeoStrictness } from "@/lib/trip-ai/tripAutoConfig";
import { geocodePhotonPreferred, geocodeTripAnchor, regionHintsFromDestination } from "@/lib/geocoding/photonGeocode";

type Point = { lat: number; lng: number };

function clean(s: unknown) {
  return String(s || "").trim();
}

function lc(s: unknown) {
  return clean(s).toLowerCase();
}

function haversineKm(a: Point, b: Point): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLon / 2);
  const h = s1 * s1 + Math.cos(lat1) * Math.cos(lat2) * s2 * s2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function countryTokenFromDestination(destination: string): string {
  const parts = destination
    .split(/[,|·\/]+/g)
    .map((x) => x.trim())
    .filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 1]! : destination.trim();
}

function strictnessMaxKm(strictness: TripAutoGeoStrictness): number {
  if (strictness === "strict") return 75;
  if (strictness === "loose") return 260;
  return 140;
}

function buildQuery(params: {
  title: string;
  place_name: string | null;
  address: string | null;
  baseCity: string;
  country: string;
}) {
  const parts = [
    clean(params.place_name) || "",
    clean(params.address) || "",
    clean(params.baseCity) || "",
    clean(params.country) || "",
  ].filter(Boolean);
  if (!parts.length) return null;
  // Title al final para no eclipsar ciudad/país
  const title = clean(params.title);
  if (title && !parts.some((p) => lc(p) === lc(title))) parts.push(title);
  return parts.join(", ");
}

function fallbackLocalItem(params: { destination: string; baseCity: string; idx: number }) {
  const city = clean(params.baseCity) || clean(params.destination) || "Destino";
  const country = clean(params.destination) || "Destino";
  const slots = [
    { t: `Paseo por el centro de ${city}`, kind: "visit", time: "10:00" },
    { t: `Museo principal de ${city}`, kind: "museum", time: "12:30" },
    { t: `Mercado local en ${city}`, kind: "food", time: "16:00" },
    { t: `Mirador / atardecer en ${city}`, kind: "visit", time: "19:30" },
  ];
  const s = slots[Math.min(Math.max(0, params.idx), slots.length - 1)]!;
  return {
    title: s.t,
    activity_kind: s.kind,
    place_name: city,
    address: `${city}, ${country}`,
    start_time: s.time,
    notes: "Ajustado automáticamente para mantener coherencia geográfica.",
  };
}

export async function validateAndRepairItinerary(params: {
  itinerary: ExecutableItineraryPayload;
  destination: string;
  baseCityByDay?: string[];
  strictness: TripAutoGeoStrictness;
}): Promise<{ itinerary: ExecutableItineraryPayload; repairedCount: number }> {
  const destination = clean(params.destination) || "Destino";
  const country = countryTokenFromDestination(destination);
  const anchor = await geocodeTripAnchor(destination).catch(() => null);
  const regionHints = regionHintsFromDestination(destination);
  const maxKm = strictnessMaxKm(params.strictness);

  const cache = new Map<string, { pt: Point | null; label: string | null }>();
  const geocode = async (q: string) => {
    const key = lc(q);
    if (cache.has(key)) return cache.get(key)!;
    const hit = await geocodePhotonPreferred(q, { anchor, regionHints, maxDistanceKm: 50000 }).catch(() => null);
    const val = hit ? { pt: { lat: hit.lat, lng: hit.lng }, label: hit.label } : { pt: null, label: null };
    cache.set(key, val);
    return val;
  };

  let repairedCount = 0;
  const days = (params.itinerary.days || []).map((d) => ({ ...d, items: Array.isArray(d.items) ? [...d.items] : [] }));
  for (let di = 0; di < days.length; di++) {
    const day = days[di]!;
    const baseCity =
      (Array.isArray(params.baseCityByDay) && params.baseCityByDay[di] ? clean(params.baseCityByDay[di]) : "") ||
      destination;

    const pts: Array<{ idx: number; pt: Point | null }> = [];
    for (let ii = 0; ii < day.items.length; ii++) {
      const item = day.items[ii] as any;
      const title = clean(item?.title);
      if (!title) continue;
      const q = buildQuery({
        title,
        place_name: typeof item?.place_name === "string" ? item.place_name : null,
        address: typeof item?.address === "string" ? item.address : null,
        baseCity,
        country,
      });
      if (!q) continue;
      const hit = await geocode(q);
      const isInCountry = hit.label ? lc(hit.label).includes(lc(country)) : false;
      if (!hit.pt || !isInCountry) {
        // Segundo intento: reforzar con baseCity+country
        const q2 = `${title}, ${baseCity}, ${country}`.trim();
        const hit2 = await geocode(q2);
        const ok2 = hit2.pt && hit2.label && lc(hit2.label).includes(lc(country));
        if (!ok2) {
          day.items[ii] = fallbackLocalItem({ destination, baseCity, idx: ii }) as any;
          repairedCount += 1;
          pts.push({ idx: ii, pt: null });
          continue;
        }
        // Reparar address para que sea consistente
        day.items[ii] = { ...(day.items[ii] as any), address: hit2.label || `${baseCity}, ${country}` };
        repairedCount += 1;
        pts.push({ idx: ii, pt: hit2.pt });
        continue;
      }
      // Normalizar address si falta
      if (!clean(item?.address) && hit.label) {
        day.items[ii] = { ...(day.items[ii] as any), address: hit.label };
        repairedCount += 1;
      }
      pts.push({ idx: ii, pt: hit.pt });
    }

    if (params.strictness === "loose") continue;
    const validPts = pts.filter((x) => x.pt).map((x) => ({ idx: x.idx, pt: x.pt! }));
    if (validPts.length >= 2) {
      // Si hay puntos muy separados el mismo día, sustituimos items posteriores por fallback local.
      const origin = validPts[0]!;
      for (let k = 1; k < validPts.length; k++) {
        const cur = validPts[k]!;
        const dist = haversineKm(origin.pt, cur.pt);
        if (dist > maxKm) {
          const ii = cur.idx;
          day.items[ii] = fallbackLocalItem({ destination, baseCity, idx: ii }) as any;
          repairedCount += 1;
        }
      }
    }
  }

  return { itinerary: { ...params.itinerary, days }, repairedCount };
}

