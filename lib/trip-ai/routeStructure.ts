import { geocodePhotonPreferred, geocodeTripAnchor, regionHintsFromDestination } from "@/lib/geocoding/photonGeocode";
import type { TripAutoConfig, TripAutoGeoStrictness } from "@/lib/trip-ai/tripAutoConfig";
import type { ResolvedTripCreation } from "@/lib/trip-ai/tripCreationResolve";

export type RouteStructureSegment = {
  segmentKey: string;
  city: string;
  nights: number;
  dates: string[];
  startDate: string | null;
  endDate: string | null;
};

export type RouteStructure = {
  version: 1;
  baseCityByDay: string[];
  segments: RouteStructureSegment[];
};

type Candidate = { label: string; lat: number; lng: number };

function clean(s: unknown) {
  return String(s || "").trim();
}

function lc(s: unknown) {
  return clean(s).toLowerCase();
}

function isIsoDate(s: unknown) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

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

function strictnessThresholdKm(strictness: TripAutoGeoStrictness): number {
  if (strictness === "auto") return 240;
  if (strictness === "strict") return 140;
  if (strictness === "loose") return 380;
  return 240;
}

function uniqLabels(list: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of list) {
    const t = clean(x);
    if (!t) continue;
    const k = lc(t);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

function extractOneWordCandidates(mustSee: string[]): string[] {
  const out: string[] = [];
  for (const m of mustSee || []) {
    const t = clean(m);
    if (!t) continue;
    const parts = t.split(/\s+/g).filter(Boolean);
    if (parts.length === 1 && t.length >= 3 && t.length <= 28) out.push(t);
  }
  return out;
}

function distributeNights(totalDays: number, cityCount: number): number[] {
  const n = Math.max(1, Math.round(totalDays));
  const c = Math.max(1, Math.round(cityCount));
  if (c === 1) return [n];
  const minSeg = n >= c * 2 ? 2 : 1;
  const segDays = new Array<number>(c).fill(minSeg);
  let remaining = n - segDays.reduce((a, b) => a + b, 0);
  let idx = 0;
  while (remaining > 0) {
    const target = idx % c;
    segDays[target] = (segDays[target] || 0) + 1;
    remaining -= 1;
    idx += 1;
  }
  return segDays;
}

function buildSegments(baseCityByDay: string[], startDate: string): RouteStructureSegment[] {
  const segments: RouteStructureSegment[] = [];
  let current: RouteStructureSegment | null = null;
  for (let i = 0; i < baseCityByDay.length; i++) {
    const city = clean(baseCityByDay[i] || "") || "Destino";
    const date = addDaysIso(startDate, i);
    if (!current || lc(current.city) !== lc(city)) {
      if (current) segments.push(current);
      const segOrdinal = segments.length;
      current = {
        segmentKey: `${city}|${date}|${segOrdinal}`,
        city,
        nights: 0,
        dates: [],
        startDate: date,
        endDate: null,
      };
    }
    current.nights += 1;
    current.dates.push(date);
    current.endDate = addDaysIso(date, 1);
  }
  if (current) segments.push(current);
  return segments;
}

function pickRepresentativeLabel(cluster: Candidate[]): string {
  if (!cluster.length) return "Destino";
  // prefer label that looks like a city (shorter, fewer commas)
  const sorted = [...cluster].sort((a, b) => a.label.split(",").length - b.label.split(",").length || a.label.length - b.label.length);
  return clean(sorted[0]?.label) || "Destino";
}

function clusterCandidates(cands: Candidate[], thresholdKm: number): Candidate[][] {
  const remaining = [...cands];
  const clusters: Candidate[][] = [];
  while (remaining.length) {
    const seed = remaining.shift()!;
    const cluster: Candidate[] = [seed];
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = remaining.length - 1; i >= 0; i--) {
        const cand = remaining[i]!;
        const closeToAny = cluster.some((x) => haversineKm(x, cand) <= thresholdKm);
        if (closeToAny) {
          cluster.push(cand);
          remaining.splice(i, 1);
          changed = true;
        }
      }
    }
    clusters.push(cluster);
  }
  return clusters;
}

function orderClustersGreedy(
  clusters: Candidate[][],
  start: Candidate | null,
  end: Candidate | null
): Candidate[][] {
  if (clusters.length <= 1) return clusters;
  const centroid = (cl: Candidate[]) => {
    const n = cl.length || 1;
    const lat = cl.reduce((a, b) => a + b.lat, 0) / n;
    const lng = cl.reduce((a, b) => a + b.lng, 0) / n;
    return { lat, lng };
  };
  const remaining = clusters.map((cl) => ({ cl, c: centroid(cl) }));
  const ordered: typeof remaining = [];
  let cur = start ? { lat: start.lat, lng: start.lng } : remaining[0]!.c;
  const endPt = end ? { lat: end.lat, lng: end.lng } : null;

  while (remaining.length) {
    let bestIdx = 0;
    let bestScore = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const cand = remaining[i]!;
      const dCur = haversineKm(cur, cand.c);
      const dEnd = endPt ? haversineKm(cand.c, endPt) : 0;
      const score = dCur + (endPt ? dEnd * 0.25 : 0);
      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    const next = remaining.splice(bestIdx, 1)[0]!;
    ordered.push(next);
    cur = next.c;
  }
  return ordered.map((x) => x.cl);
}

export async function deriveRouteStructure(params: {
  resolved: ResolvedTripCreation;
  config: TripAutoConfig;
  /** Permite inyectar geocode para tests */
  geocode?: (q: string, opts: { anchor: { lat: number; lng: number } | null; regionHints: string[] }) => Promise<Candidate | null>;
}): Promise<RouteStructure> {
  const { resolved, config } = params;
  const nDays = Math.max(1, Math.round(resolved.durationDays));
  const strictness = config.geo.strictness;

  const baseCity = clean(config.lodging.baseCity);
  if (config.lodging.baseCityMode === "single" && baseCity) {
    const baseCityByDay = Array.from({ length: nDays }, () => baseCity);
    return { version: 1, baseCityByDay, segments: buildSegments(baseCityByDay, resolved.startDate) };
  }

  const destination = clean(resolved.destination) || "Destino";
  const regionHints = regionHintsFromDestination(destination);
  const anchor = await geocodeTripAnchor(destination).catch(() => null);
  const geocode =
    params.geocode ||
    (async (q: string, opts: { anchor: { lat: number; lng: number } | null; regionHints: string[] }) => {
      const hit = await geocodePhotonPreferred(q, { anchor: opts.anchor, regionHints: opts.regionHints, maxDistanceKm: 50000 });
      if (!hit) return null;
      return { label: q, lat: hit.lat, lng: hit.lng };
    });

  const rawCandidates = uniqLabels([
    clean(resolved.intent.startLocation),
    ...extractOneWordCandidates(resolved.intent.mustSee || []),
    clean(resolved.intent.endLocation),
  ]);

  const geocoded: Candidate[] = [];
  for (const label of rawCandidates) {
    if (!label) continue;
    const q = `${label}, ${destination}`.trim();
    const hit = await geocode(q, { anchor, regionHints });
    if (hit) geocoded.push({ label, lat: hit.lat, lng: hit.lng });
  }

  // Si no hay candidatos, todo el viaje en destino principal
  if (!geocoded.length) {
    const baseCityByDay = Array.from({ length: nDays }, () => destination);
    return { version: 1, baseCityByDay, segments: buildSegments(baseCityByDay, resolved.startDate) };
  }

  const threshold = strictnessThresholdKm(strictness);
  const clustersRaw = clusterCandidates(geocoded, threshold);

  // Limitar nº de clusters para no fragmentar demasiado (especialmente con mustSee ruidosos)
  const maxClusters = Math.max(1, Math.min(4, Math.ceil(nDays / 2)));
  let clusters = clustersRaw;
  if (clustersRaw.length > maxClusters) {
    // Fusiona clusters pequeños dentro de un threshold ampliado
    const expanded = threshold * 1.35;
    clusters = clusterCandidates(geocoded, expanded).slice(0, maxClusters);
  }

  const start = geocoded.find((c) => lc(c.label) === lc(resolved.intent.startLocation)) || null;
  const end = geocoded.find((c) => lc(c.label) === lc(resolved.intent.endLocation)) || null;
  clusters = orderClustersGreedy(clusters, start, end);

  const cities = clusters.map((cl) => pickRepresentativeLabel(cl));
  const nightsByCity = distributeNights(nDays, cities.length);
  const baseCityByDay: string[] = [];
  for (let i = 0; i < cities.length; i++) {
    const city = cities[i] || destination;
    const nights = nightsByCity[i] || 1;
    for (let k = 0; k < nights; k++) baseCityByDay.push(city);
  }
  // Normaliza longitud exacta
  const normalized = baseCityByDay.slice(0, nDays);
  while (normalized.length < nDays) normalized.push(normalized[normalized.length - 1] || destination);

  return { version: 1, baseCityByDay: normalized, segments: buildSegments(normalized, resolved.startDate) };
}

