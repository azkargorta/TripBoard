/**
 * Geocodificación vía Photon con sesgo espacial y filtro por distancia al ancla del viaje,
 * para reducir homónimos en otros países.
 */

export type PhotonGeocodeResult = {
  lat: number;
  lng: number;
  label: string;
};

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
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

function featureLabel(feature: any): string {
  const p = feature?.properties && typeof feature.properties === "object" ? feature.properties : {};
  return [p.name, p.street, p.city, p.state, p.country].filter(Boolean).join(", ");
}

function featurePoint(feature: any): { lat: number; lng: number } | null {
  const coords = feature?.geometry?.coordinates;
  const lng = Array.isArray(coords) ? Number(coords[0]) : NaN;
  const lat = Array.isArray(coords) ? Number(coords[1]) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/** Trocea un texto tipo destino de viaje en pistas para refuerzo de consulta / país. */
export function regionHintsFromDestination(destination: string | null | undefined): string[] {
  if (!destination || typeof destination !== "string") return [];
  const parts = destination
    .split(/[,|·\/]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
  const lower = parts.map((p) => p.toLowerCase());
  return Array.from(new Set(lower));
}

async function photonFetch(q: string, opts: { limit: number; bias?: { lat: number; lng: number } | null }): Promise<any[]> {
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", String(opts.limit));
  if (opts.bias && Number.isFinite(opts.bias.lat) && Number.isFinite(opts.bias.lng)) {
    url.searchParams.set("lat", String(opts.bias.lat));
    url.searchParams.set("lon", String(opts.bias.lng));
  }
  const resp = await fetch(url.toString(), { method: "GET", cache: "no-store" });
  const payload: any = await resp.json().catch(() => null);
  if (!resp.ok) return [];
  return Array.isArray(payload?.features) ? payload.features : [];
}

/** Sinónimos comunes ES ↔ inglés en etiquetas OSM/Photon */
const COUNTRY_ALIASES: Record<string, string[]> = {
  polonia: ["poland", "polska", "polonia"],
  españa: ["spain", "españa", "espana", "kingdom of spain"],
  francia: ["france", "francia"],
  italia: ["italy", "italia", "italien"],
  alemania: ["germany", "deutschland", "alemania"],
  portugal: ["portugal"],
  croacia: ["croatia", "hrvatska", "croacia"],
  "republica checa": ["czech", "česko", "czechia", "chequia"],
  chequia: ["czech", "česko", "czechia", "chequia"],
  hungria: ["hungary", "magyarország", "hungria"],
  rumania: ["romania", "românia", "rumania", "rumänien"],
  grecia: ["greece", "hellas", "grecia"],
};

function expandedHintTokens(hint: string): string[] {
  const h = hint.toLowerCase().trim();
  if (h.length < 2) return [];
  const extra = COUNTRY_ALIASES[h] || [];
  return Array.from(new Set([h, ...extra]));
}

function countryMatches(hints: string[], feature: any): boolean {
  if (!hints.length) return true;
  const p = feature?.properties && typeof feature.properties === "object" ? feature.properties : {};
  const country = typeof p.country === "string" ? p.country.toLowerCase() : "";
  const state = typeof p.state === "string" ? p.state.toLowerCase() : "";
  const city = typeof p.city === "string" ? p.city.toLowerCase() : "";
  const blob = `${country} ${state} ${city}`;
  return hints.some((hint) => {
    if (hint.length < 2) return false;
    return expandedHintTokens(hint).some((t) => t.length > 2 && blob.includes(t));
  });
}

/**
 * Primera coordenada útil para anclar el viaje (ciudad/región del destino).
 */
export async function geocodeTripAnchor(destination: string | null | undefined): Promise<{ lat: number; lng: number } | null> {
  const q = typeof destination === "string" ? destination.trim() : "";
  if (!q) return null;
  const features = await photonFetch(q, { limit: 5, bias: null });
  for (const f of features) {
    const pt = featurePoint(f);
    if (pt) return pt;
  }
  return null;
}

/**
 * Resuelve un lugar priorizando resultados cerca del ancla y, si hay pistas, coherentes con país/región.
 */
export async function geocodePhotonPreferred(
  query: string,
  opts: {
    anchor?: { lat: number; lng: number } | null;
    regionHints?: string[];
    maxDistanceKm?: number;
  } = {}
): Promise<PhotonGeocodeResult | null> {
  const raw = typeof query === "string" ? query.trim() : "";
  if (!raw) return null;

  const anchor = opts.anchor && Number.isFinite(opts.anchor.lat) && Number.isFinite(opts.anchor.lng) ? opts.anchor : null;
  const hints = opts.regionHints ?? [];
  const maxD = typeof opts.maxDistanceKm === "number" && Number.isFinite(opts.maxDistanceKm) ? opts.maxDistanceKm : 380;

  const tryPick = async (q: string, bias: typeof anchor): Promise<PhotonGeocodeResult | null> => {
    const features = await photonFetch(q, { limit: 14, bias });
    let best: { dist: number; label: string; lat: number; lng: number } | null = null;

    for (const f of features) {
      const pt = featurePoint(f);
      if (!pt) continue;
      if (hints.length && !countryMatches(hints, f)) continue;
      const dist = anchor ? haversineKm(anchor, pt) : 0;
      if (!best || dist < best.dist) {
        best = { dist, label: featureLabel(f) || q, ...pt };
      }
    }

    if (best && anchor && best.dist > maxD) {
      // Demasiado lejos del viaje: descartar este intento
      return null;
    }
    if (best) return { lat: best.lat, lng: best.lng, label: best.label };

    // Sin filtro de país si descartó todos pero tenemos ancla: distancia pura
    if (hints.length && anchor) {
      let best2: { dist: number; label: string; lat: number; lng: number } | null = null;
      for (const f of features) {
        const pt = featurePoint(f);
        if (!pt) continue;
        const dist = haversineKm(anchor, pt);
        if (!best2 || dist < best2.dist) {
          best2 = { dist, label: featureLabel(f) || q, ...pt };
        }
      }
      if (best2 && best2.dist <= maxD) return { lat: best2.lat, lng: best2.lng, label: best2.label };
      return null;
    }

    // Sin ancla: primer resultado razonable
    for (const f of features) {
      const pt = featurePoint(f);
      if (!pt) continue;
      return { lat: pt.lat, lng: pt.lng, label: featureLabel(f) || q };
    }
    return null;
  };

  let result = await tryPick(raw, anchor);
  if (!result && anchor && hints.length) {
    const suffix = hints.slice(0, 2).join(", ");
    result = await tryPick(`${raw}, ${suffix}`, anchor);
  }
  return result;
}
