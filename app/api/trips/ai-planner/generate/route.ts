import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { geocodePhotonPreferred, geocodeTripAnchor, regionHintsFromDestination } from "@/lib/geocoding/photonGeocode";
import { addDaysIso } from "@/lib/trip-ai/tripCreationDates";

export const runtime = "nodejs";
export const maxDuration = 120;

type LatLng = { lat: number; lng: number };
type Poi = { name: string; lat: number; lng: number; osm?: { type: string; id: string } };

type Category =
  | "culture"
  | "nature"
  | "viewpoint"
  | "neighborhood"
  | "market"
  | "excursion"
  | "gastro_experience"
  | "shopping"
  | "night";

const ALL_CATEGORIES: Category[] = [
  "culture",
  "nature",
  "viewpoint",
  "neighborhood",
  "market",
  "excursion",
  "gastro_experience",
  "shopping",
  "night",
];

function cleanString(v: unknown) {
  return String(v ?? "").trim();
}

function isoOk(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function dedupeByName(rows: Poi[]): Poi[] {
  const seen = new Set<string>();
  const out: Poi[] = [];
  for (const r of rows) {
    const key = r.name.trim().toLowerCase();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function pickN<T>(arr: T[], n: number): T[] {
  const out: T[] = [];
  for (const it of arr) {
    out.push(it);
    if (out.length >= n) break;
  }
  return out;
}

function dayCountBetween(start: string, end: string) {
  const a = new Date(`${start}T12:00:00Z`).getTime();
  const b = new Date(`${end}T12:00:00Z`).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 1;
  return Math.max(1, Math.round((b - a) / (86400 * 1000)) + 1);
}

function inferBadDay(day: any, ctx: { minItems: number; requireEvening: boolean }) {
  const items = Array.isArray(day?.items) ? day.items : [];
  if (items.length < ctx.minItems) return true; // M1
  if (items.some((it: any) => it?.latitude == null || it?.longitude == null)) return true; // M5
  const titles = items.map((it: any) => String(it?.title || "").toLowerCase());
  const hasGeneric = titles.some((t: string) =>
    /\b(paseo por la ciudad|paseo por el centro|zona animada|ambiente local|tiempo libre|explorar el centro|visita panor[aá]mica)\b/i.test(t)
  );
  if (hasGeneric) return true; // M3
  const hasBadFood = titles.some(
    (t: string) => /\b(almuerzo|cena)\b/i.test(t) && !/\b(bodega|cata|taller|tour|curso|mercado)\b/i.test(t)
  );
  if (hasBadFood) return true; // M4
  if (ctx.requireEvening) {
    const times = items.map((it: any) => String(it?.activity_time || "")).filter(Boolean);
    const last = times.sort().slice(-1)[0] || "";
    if (last && last < "18:00") return true; // M2
  }
  return false;
}

async function fetchPois(params: { center: LatLng; category: Category; radiusMeters: number; limit: number }): Promise<Poi[]> {
  const resp = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: `data=${encodeURIComponent(buildOverpassQuery(params))}`,
    cache: "no-store",
  });
  const payload: any = await resp.json().catch(() => null);
  if (!resp.ok) return [];
  const elements = Array.isArray(payload?.elements) ? payload.elements : [];
  const rows: Poi[] = [];
  for (const el of elements) {
    const tags = el?.tags && typeof el.tags === "object" ? el.tags : {};
    const name = typeof tags?.name === "string" ? String(tags.name).trim() : "";
    const lat = typeof el?.lat === "number" ? el.lat : typeof el?.center?.lat === "number" ? el.center.lat : null;
    const lng = typeof el?.lon === "number" ? el.lon : typeof el?.center?.lon === "number" ? el.center.lon : null;
    if (!name || lat == null || lng == null) continue;
    rows.push({
      name,
      lat,
      lng,
      osm: { type: String(el?.type || "node"), id: String(el?.id || "") },
    });
  }
  return dedupeByName(rows).slice(0, params.limit);
}

function buildOverpassQuery(params: { center: LatLng; category: Category; radiusMeters: number; limit: number }): string {
  const around = `(around:${Math.floor(params.radiusMeters)},${params.center.lat},${params.center.lng})`;
  const any = (k: string, v: string) => [
    `node["${k}"="${v}"]${around};`,
    `way["${k}"="${v}"]${around};`,
    `relation["${k}"="${v}"]${around};`,
  ];
  const blocks: string[] = [];
  switch (params.category) {
    case "culture":
      blocks.push(
        ...any("tourism", "museum"),
        ...any("tourism", "attraction"),
        ...any("amenity", "theatre"),
        ...any("amenity", "arts_centre"),
        ...any("historic", "monument"),
        ...any("historic", "castle"),
        ...any("historic", "archaeological_site")
      );
      break;
    case "nature":
      blocks.push(
        ...any("leisure", "park"),
        ...any("boundary", "national_park"),
        ...any("leisure", "nature_reserve"),
        ...any("natural", "peak"),
        ...any("natural", "waterfall"),
        ...any("natural", "beach"),
        ...any("natural", "bay")
      );
      break;
    case "viewpoint":
      blocks.push(...any("tourism", "viewpoint"));
      break;
    case "market":
      blocks.push(...any("amenity", "marketplace"));
      break;
    case "shopping":
      blocks.push(...any("shop", "department_store"), ...any("shop", "mall"), ...any("tourism", "gift_shop"));
      break;
    case "night":
      blocks.push(...any("amenity", "bar"), ...any("amenity", "pub"), ...any("amenity", "nightclub"), ...any("amenity", "cinema"), ...any("amenity", "theatre"));
      break;
    case "gastro_experience":
      blocks.push(...any("tourism", "wine_cellar"), ...any("craft", "winery"), ...any("craft", "brewery"), ...any("amenity", "cooking_school"));
      break;
    case "excursion":
      blocks.push(...any("tourism", "attraction"), ...any("natural", "waterfall"), ...any("natural", "peak"), ...any("boundary", "national_park"));
      break;
    case "neighborhood":
      blocks.push(...any("place", "neighbourhood"), ...any("place", "suburb"));
      break;
    default:
      break;
  }
  return `
[out:json][timeout:20];
(
${blocks.map((x) => `  ${x}`).join("\n")}
);
out center tags ${Math.max(50, params.limit * 6)};
`.trim();
}

function proposeRadiusMeters(poiCountEstimate: number): number {
  // Adaptativo: si hay pocos POIs cerca, ampliamos.
  if (poiCountEstimate <= 2) return 22000;
  if (poiCountEstimate >= 40) return 7000;
  if (poiCountEstimate >= 18) return 12000;
  return 18000;
}

function sumPools(pools: Record<Category, Poi[]>): number {
  let n = 0;
  for (const k of ALL_CATEGORIES) n += Array.isArray(pools[k]) ? pools[k]!.length : 0;
  return n;
}

function proposeMinItems(dayType: "big_city" | "small_city" | "nature"): number {
  if (dayType === "nature") return 2;
  if (dayType === "small_city") return 3;
  return 4;
}

function classifyDayType(pools: Record<Category, Poi[]>): "big_city" | "small_city" | "nature" {
  const culture = pools.culture?.length || 0;
  const nature = pools.nature?.length || 0;
  const market = pools.market?.length || 0;
  if (nature >= Math.max(10, culture + market)) return "nature";
  const score = culture + market;
  if (score >= 25) return "big_city";
  return "small_city";
}

function slotTemplate(dayType: "big_city" | "small_city" | "nature") {
  if (dayType === "nature") {
    return [
      { time: "09:00", cats: ["nature", "excursion"] as Category[] },
      { time: "16:30", cats: ["viewpoint", "nature"] as Category[] },
      { time: "20:30", cats: ["gastro_experience", "culture"] as Category[] },
    ];
  }
  if (dayType === "small_city") {
    return [
      { time: "10:00", cats: ["culture", "neighborhood"] as Category[] },
      { time: "13:30", cats: ["market", "culture"] as Category[] },
      { time: "17:00", cats: ["viewpoint", "culture"] as Category[] },
      { time: "20:30", cats: ["gastro_experience", "night"] as Category[] },
    ];
  }
  return [
    { time: "09:30", cats: ["culture"] as Category[] },
    { time: "12:30", cats: ["market", "neighborhood"] as Category[] },
    { time: "16:30", cats: ["culture", "viewpoint"] as Category[] },
    { time: "20:30", cats: ["gastro_experience", "night"] as Category[] },
  ];
}

function ensureNoGenericTitle(title: string) {
  const t = title.toLowerCase();
  if (/\b(paseo|zona animada|ambiente local|tiempo libre|explorar)\b/i.test(t)) return false;
  return true;
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

    const body = await req.json().catch(() => null);
    const destinationsRaw = Array.isArray(body?.destinations) ? body.destinations : Array.isArray(body?.places) ? body.places : [];
    const destinations = (destinationsRaw as any[]).map((x) => cleanString(x)).filter(Boolean).slice(0, 10);
    const startDate = cleanString(body?.start_date || body?.startDate);
    const endDate = cleanString(body?.end_date || body?.endDate);
    const selectedByStop = (body?.selectedPoisByStop && typeof body.selectedPoisByStop === "object") ? body.selectedPoisByStop : null;
    const staysInput = Array.isArray(body?.stays) ? body.stays : null;
    const regenerateBadOnly = Boolean(body?.regenerateBadOnly);
    const badDayNums = Array.isArray(body?.badDayNums) ? body.badDayNums.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n) && n >= 1) : null;
    const targetDayNums = Array.isArray(body?.targetDayNums)
      ? body.targetDayNums.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n) && n >= 1)
      : null;

    if (!destinations.length) return NextResponse.json({ error: "Faltan destinos." }, { status: 400 });
    if (!isoOk(startDate) || !isoOk(endDate)) return NextResponse.json({ error: "Fechas inválidas." }, { status: 400 });

    const totalDays = dayCountBetween(startDate, endDate);
    const destinationLabel = destinations.join(" · ");
    const anchor = await geocodeTripAnchor(destinationLabel);
    const regionHints = regionHintsFromDestination(destinationLabel);

    // Geocode de paradas base
    const stopGeo = await Promise.all(
      destinations.map(async (label) => {
        const g = await geocodePhotonPreferred(label, { anchor, regionHints, maxDistanceKm: 50000 });
        return { label, geo: g };
      })
    );

    const stops = stopGeo
      .map((s) => ({
        label: s.label,
        center: s.geo ? ({ lat: s.geo.lat, lng: s.geo.lng } as LatLng) : null,
        resolvedLabel: s.geo?.label || s.label,
      }))
      .filter((s: { label: string; resolvedLabel: string; center: LatLng | null }) => Boolean(s.center)) as Array<{
      label: string;
      resolvedLabel: string;
      center: LatLng;
    }>;

    if (!stops.length) return NextResponse.json({ error: "No se pudieron geocodificar los destinos." }, { status: 400 });

    // Pools de POIs por stop/categoría (para sugerencias y para el planner)
    const poisByStop: Record<string, Record<Category, Poi[]>> = {};
    for (const stop of stops) {
      const pools: Record<Category, Poi[]> = {} as any;
      let center: LatLng = stop.center;

      // First pass small radius to estimate
      let rough = await fetchPois({ center, category: "culture", radiusMeters: 3500, limit: 40 });

      // Si es un país (o centro rural) suele dar 0/1. Recentramos a "capital".
      if (rough.length <= 1) {
        const cap = await geocodePhotonPreferred(`${stop.label} capital`, { anchor, regionHints, maxDistanceKm: 50000 });
        if (cap) {
          center = { lat: cap.lat, lng: cap.lng };
          rough = await fetchPois({ center, category: "culture", radiusMeters: 3500, limit: 40 });
        }
      }

      const radius = proposeRadiusMeters(rough.length);
      for (const cat of ALL_CATEGORIES) pools[cat] = await fetchPois({ center, category: cat, radiusMeters: radius, limit: 50 });

      // Evita borradores vacíos: si no hay POIs suficientes, damos un error accionable.
      if (sumPools(pools) < 4) {
        return NextResponse.json(
          {
            error:
              `No he encontrado suficientes lugares concretos cerca de “${stop.label}”. ` +
              `Parece un destino demasiado amplio. Prueba a poner una ciudad o región (ej. “Buenos Aires”, “Mendoza”, “Bariloche”).`,
          },
          { status: 400 }
        );
      }
      poisByStop[stop.label] = pools;
    }

    // Propuesta de noches: por densidad (culture+market+nature) + mínimo 1 por stop
    const weights = stops.map((s) => {
      const pools = poisByStop[s.label];
      const w = (pools?.culture?.length || 0) + (pools?.market?.length || 0) + (pools?.nature?.length || 0) * 0.9;
      return { stop: s.label, w: Math.max(1, w) };
    });
    const sumW = weights.reduce((a, b) => a + b.w, 0) || 1;
    let stays: Array<{ stop: string; nights: number }> = [];
    if (staysInput && staysInput.length) {
      stays = staysInput
        .map((x: any) => ({ stop: cleanString(x?.stop), nights: clamp(Number(x?.nights) || 1, 1, 60) }))
        .filter((x: { stop: string; nights: number }) => Boolean(x.stop));
    } else {
      stays = weights.map(({ stop, w }) => ({ stop, nights: Math.max(1, Math.round((w / sumW) * totalDays)) }));
      // Ajuste para que sum = totalDays
      let sum = stays.reduce((a, b) => a + b.nights, 0);
      while (sum > totalDays && stays.length) {
        const idx = stays.findIndex((s) => s.nights > 1);
        if (idx < 0) break;
        stays[idx]!.nights -= 1;
        sum -= 1;
      }
      while (sum < totalDays && stays.length) {
        // añade al stop con mayor peso
        const best = weights.slice().sort((a, b) => b.w - a.w)[0]?.stop;
        const idx = stays.findIndex((s) => s.stop === best) >= 0 ? stays.findIndex((s) => s.stop === best) : 0;
        stays[idx]!.nights += 1;
        sum += 1;
      }
    }

    // baseCityByDay (stop por día)
    const baseByDay: string[] = [];
    for (const s of stays) for (let i = 0; i < s.nights; i++) baseByDay.push(s.stop);
    while (baseByDay.length < totalDays) baseByDay.push(stays[stays.length - 1]?.stop || stops[0]!.label);
    baseByDay.splice(totalDays);

    // Helper de selección de POIs: usa selección del usuario si existe; si no, top del pool
    const selectedNamesByStop: Record<string, Set<string>> = {};
    if (selectedByStop && typeof selectedByStop === "object") {
      for (const k of Object.keys(selectedByStop)) {
        const arr = Array.isArray((selectedByStop as any)[k]) ? (selectedByStop as any)[k] : [];
        selectedNamesByStop[k] = new Set(
          arr
            .map((x: any) => cleanString(x?.name || x))
            .filter(Boolean)
            .map((x: string) => x.toLowerCase())
        );
      }
    }

    const usedNames = new Set<string>();
    const makeDay = (dayNum: number, stop: string) => {
      const pools = poisByStop[stop];
      const type = classifyDayType(pools);
      const minItems = proposeMinItems(type);
      const requireEvening = type !== "nature";
      const slots = slotTemplate(type);

      const pickFromCats = (cats: Category[]): Poi | null => {
        for (const cat of cats) {
          const pool = pools?.[cat] || [];
          // prefer user-selected for this stop
          const selected = selectedNamesByStop[stop];
          if (selected && selected.size) {
            const hit = pool.find((p) => selected.has(p.name.toLowerCase()) && !usedNames.has(p.name.toLowerCase()));
            if (hit) return hit;
          }
          const hit2 = pool.find((p) => !usedNames.has(p.name.toLowerCase()));
          if (hit2) return hit2;
        }
        return null;
      };

      const items: any[] = [];
      for (const s of slots) {
        const poi = pickFromCats(s.cats);
        if (!poi) continue;
        const title = poi.name.trim();
        if (!ensureNoGenericTitle(title)) continue;
        usedNames.add(title.toLowerCase());
        items.push({
          title,
          activity_kind: s.cats[0] || "visit",
          activity_type: "general",
          place_name: poi.name,
          address: `${poi.name}, ${stop}`,
          latitude: poi.lat,
          longitude: poi.lng,
          activity_time: s.time,
          source: "ai_planner",
        });
      }

      // Relleno si falta densidad: usa culture/nature/market/viewpoint
      const fillerCats: Category[] = type === "nature" ? ["nature", "viewpoint", "excursion"] : ["culture", "market", "viewpoint", "neighborhood"];
      while (items.length < minItems) {
        const poi = pickFromCats(fillerCats);
        if (!poi) break;
        const title = poi.name.trim();
        if (!ensureNoGenericTitle(title)) continue;
        usedNames.add(title.toLowerCase());
        const time = items.length === 0 ? "10:00" : items.length === 1 ? "13:30" : items.length === 2 ? "17:00" : "20:30";
        items.push({
          title,
          activity_kind: fillerCats[0],
          activity_type: "general",
          place_name: poi.name,
          address: `${poi.name}, ${stop}`,
          latitude: poi.lat,
          longitude: poi.lng,
          activity_time: time,
          source: "ai_planner",
        });
      }

      // Asegura tarde/noche en urbano
      if (requireEvening) {
        const last = items.map((it) => String(it.activity_time || "")).sort().slice(-1)[0] || "";
        if (last && last < "18:00") {
          const poi = pickFromCats(["gastro_experience", "night", "culture"]);
          if (poi) {
            const title = poi.name.trim();
            if (ensureNoGenericTitle(title) && !usedNames.has(title.toLowerCase())) {
              usedNames.add(title.toLowerCase());
              items.push({
                title,
                activity_kind: "gastro_experience",
                activity_type: "general",
                place_name: poi.name,
                address: `${poi.name}, ${stop}`,
                latitude: poi.lat,
                longitude: poi.lng,
                activity_time: "20:30",
                source: "ai_planner",
              });
            }
          }
        }
      }

      items.sort((a, b) => String(a.activity_time || "").localeCompare(String(b.activity_time || "")));
      return { day: dayNum, date: addDaysIso(startDate, dayNum - 1), base: stop, minItems, requireEvening, items };
    };

    // Construir días; si regenBadOnly, conservamos los días “buenos” que llegan del cliente
    const incomingDays = Array.isArray(body?.days) ? body.days : null;
    const incomingMap = new Map<number, any>();
    if (incomingDays) for (const d of incomingDays) if (typeof d?.day === "number") incomingMap.set(d.day, d);

    const daysOut: any[] = [];
    for (let i = 0; i < totalDays; i++) {
      const dayNum = i + 1;
      const stop = baseByDay[i] || stays[stays.length - 1]?.stop || stops[0]!.label;
      const pools = poisByStop[stop];
      const type = classifyDayType(pools);
      const minItems = proposeMinItems(type);
      const requireEvening = type !== "nature";

      const existing = incomingMap.get(dayNum);
      const isBad = existing ? inferBadDay(existing, { minItems, requireEvening }) : true;
      const shouldRegen =
        (Array.isArray(targetDayNums) && targetDayNums.includes(dayNum)) ||
        (!incomingDays && !regenerateBadOnly) ||
        (regenerateBadOnly ? isBad : true) ||
        (Array.isArray(badDayNums) ? badDayNums.includes(dayNum) : false);

      if (!shouldRegen && existing) {
        daysOut.push(existing);
        continue;
      }

      // Insert transport day marker if base changes from prev day
      const prev = i >= 1 ? baseByDay[i - 1] : "";
      const isChange = i >= 1 && prev && prev !== stop;
      const day = makeDay(dayNum, stop);
      if (isChange) {
        day.items.unshift({
          title: `Traslado ${prev} → ${stop}`,
          activity_kind: "transport",
          activity_type: "general",
          place_name: `${prev} → ${stop}`,
          address: `${prev} → ${stop}`,
          latitude: null,
          longitude: null,
          activity_time: "08:30",
          source: "ai_planner",
          description: "Bloque de traslado entre ciudades base. Ajusta el medio/hora según tu viaje real.",
        });
        // Recorta para que no sea día normal
        if (day.items.length > 3) day.items.splice(3);
      }
      daysOut.push({
        day: day.day,
        date: day.date,
        base: day.base,
        items: day.items.map((it: any) => ({
          title: it.title,
          description: it.description || null,
          activity_date: day.date,
          activity_time: it.activity_time,
          place_name: it.place_name || it.title,
          address: it.address || `${it.title}, ${stop}`,
          latitude: typeof it.latitude === "number" ? it.latitude : null,
          longitude: typeof it.longitude === "number" ? it.longitude : null,
          activity_kind: it.activity_kind,
          activity_type: it.activity_type || "general",
          source: it.source || "ai_planner",
        })),
      });
    }

    // Sugerencias: top POIs por stop/categoría (para chips UI)
    const suggestions: Record<string, Array<{ category: Category; pois: Poi[] }>> = {};
    for (const stop of stops) {
      const pools = poisByStop[stop.label];
      suggestions[stop.label] = [
        { category: "culture", pois: pickN(pools.culture || [], 18) },
        { category: "nature", pois: pickN(pools.nature || [], 18) },
        { category: "market", pois: pickN(pools.market || [], 12) },
        { category: "viewpoint", pois: pickN(pools.viewpoint || [], 12) },
        { category: "neighborhood", pois: pickN(pools.neighborhood || [], 12) },
        { category: "gastro_experience", pois: pickN(pools.gastro_experience || [], 12) },
      ];
    }

    return NextResponse.json({
      ok: true,
      totalDays,
      startDate,
      endDate,
      destinations,
      stops: stops.map((s) => ({ key: s.label, label: s.resolvedLabel, center: s.center })),
      stays,
      baseCityByDay: baseByDay,
      suggestions,
      days: daysOut,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo generar el borrador." }, { status: 500 });
  }
}

