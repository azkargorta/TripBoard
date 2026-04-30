import { NextResponse } from "next/server";
import { enforceAiMonthlyBudgetOrThrow, trackAiUsage } from "@/lib/ai-budget";
import { monthKeyUtc } from "@/lib/ai-usage";
import type { TripCreationIntent } from "@/lib/trip-ai/tripCreationTypes";
import { resolveTripCreationDates } from "@/lib/trip-ai/tripCreationResolve";
import { normalizeTripAutoConfig } from "@/lib/trip-ai/tripAutoConfig";
import { generateExecutableItineraryFromStructure } from "@/lib/trip-ai/generateItineraryFromIntent";
import { addDaysIso } from "@/lib/trip-ai/tripCreationDates";
import { buildRouteStructureFromIntent, hasHardcodedWeight } from "@/lib/trip-ai/nightAllocation";
import { fetchAiCityWeights } from "@/lib/trip-ai/aiCityWeights";

export const runtime = "nodejs";
export const maxDuration = 120;

function clean(s: unknown) {
  return String(s || "").trim();
}

function filterMustSeeAgainstRoute(params: { mustSee: string[]; baseCityByDay: string[] }) {
  const cities = Array.from(new Set(params.baseCityByDay.map((x) => clean(x).toLowerCase()).filter(Boolean)));
  const keep: string[] = [];
  for (const raw of params.mustSee || []) {
    const t = clean(raw);
    if (!t) continue;
    const lc = t.toLowerCase();
    // Si el token es (o contiene) una de las ciudades base, NO lo forzamos como actividad.
    const isCityLike = cities.some((c) => c === lc || c.includes(lc) || lc.includes(c));
    if (isCityLike) continue;
    keep.push(t);
  }
  return keep.slice(0, 18);
}

function guessIntercityTransportMode(from: string, to: string) {
  const pair = `${clean(from).toLowerCase()} ${clean(to).toLowerCase()}`;
  if (/\b(salta|jujuy|quebrada)\b/.test(pair)) return "driving";
  return "flight";
}

// Extracts only the first segment (country/region name) from a compound destination string.
// e.g. "Argentina · Buenos Aires · Iguazú · Mendoza" → "Argentina"
function cleanCountryFromDestination(destination: string): string {
  return String(destination || "").split(/[|·]/)[0]?.trim() || String(destination || "").trim();
}

function parseTimeMin(hhmm: unknown): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
}

function toTimeStr(mins: number): string {
  const m = Math.max(0, Math.min(23 * 60 + 59, Math.round(mins)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * Shifts non-transport items whose start_time falls before
 * (transferStart + transferDurationMin + 60 min buffer) so they don't
 * overlap with a long intercity transfer.
 */
function adjustItemsAfterTransfer(items: any[], transferDurationMin: number): any[] {
  const TRANSFER_START = 8 * 60 + 30; // 08:30
  const BUFFER_MIN = 60; // 1 h buffer for check-in / lunch after arrival
  const firstFree = TRANSFER_START + transferDurationMin + BUFFER_MIN;

  let cursor = firstFree;
  return items.map((item: any) => {
    const kind = String(item?.activity_kind || "").toLowerCase();
    if (kind === "transport") return item; // keep transport as-is

    const origStart = parseTimeMin(item?.start_time);
    if (!isNaN(origStart) && origStart >= cursor) {
      // Already after the free window — just advance cursor
      const duration = typeof item?.duration_min === "number" ? item.duration_min : 90;
      cursor = Math.max(cursor, origStart + duration + 20);
      return item;
    }
    // Need to push this item forward
    const newStart = toTimeStr(cursor);
    const duration = typeof item?.duration_min === "number" ? item.duration_min : 90;
    cursor = cursor + duration + 20;
    return { ...item, start_time: newStart };
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const intent = body?.intent as TripCreationIntent | undefined;
    if (!intent) return NextResponse.json({ error: "Falta intent." }, { status: 400 });
    const offsetRaw = body?.dayOffset;
    const countRaw = body?.dayCount;
    const dayOffset = typeof offsetRaw === "number" && Number.isFinite(offsetRaw) ? Math.max(0, Math.round(offsetRaw)) : 0;
    const preferredCount = typeof countRaw === "number" && Number.isFinite(countRaw) ? Math.max(1, Math.min(4, Math.round(countRaw))) : 4;

    const provider = "gemini";
    const monthKey = monthKeyUtc();
    const { supabase, userId, shouldTrack } = await enforceAiMonthlyBudgetOrThrow({ providerId: provider });
    const { data: profileRow } = await supabase.from("profiles").select("is_premium").eq("id", userId).maybeSingle();
    if (!Boolean((profileRow as any)?.is_premium)) {
      return NextResponse.json({ error: "Necesitas cuenta Premium para usar IA.", code: "PREMIUM_REQUIRED" }, { status: 402 });
    }

    const resolved = resolveTripCreationDates(intent);
    if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: 400 });

    const totalDays = Math.max(1, resolved.durationDays);
    if (dayOffset >= totalDays) return NextResponse.json({ error: "dayOffset fuera de rango." }, { status: 400 });
    const config = normalizeTripAutoConfig(body?.config);
    // Temporal: verificar que el pace llega desde el cliente (y no cae en defaults)
    console.log("[auto-plan][generate-chunk] config.pace", {
      raw: body?.config?.pace,
      normalized: config?.pace,
      dayOffset,
      preferredCount,
      totalDays,
    });
    // Probe to identify unknown cities, then fetch AI weights (typically served from cache
    // populated by the allocate call that precedes chunk generation in normal wizard flow).
    const probeStructure = buildRouteStructureFromIntent({ intent: resolved.intent, durationDays: totalDays });
    const unknownCities = probeStructure.cityStays.filter(({ city }) => !hasHardcodedWeight(city)).map(({ city }) => city);
    const weightOverrides = await fetchAiCityWeights(unknownCities, totalDays);
    const fullStructure = weightOverrides.size > 0
      ? buildRouteStructureFromIntent({ intent: resolved.intent, durationDays: totalDays }, weightOverrides)
      : probeStructure;
    const baseAtOffset = String(fullStructure.baseCityByDay[dayOffset] || "").trim().toLowerCase();
    let contiguous = 0;
    for (let i = dayOffset; i < totalDays; i++) {
      const cur = String(fullStructure.baseCityByDay[i] || "").trim().toLowerCase();
      if (!cur || cur !== baseAtOffset) break;
      contiguous += 1;
      if (contiguous >= 4) break;
    }
    const count = Math.min(Math.max(1, contiguous || preferredCount), preferredCount, totalDays - dayOffset);
    const sliceStructure = { ...fullStructure, baseCityByDay: fullStructure.baseCityByDay.slice(dayOffset, dayOffset + count) };

    // Clave: evitamos que ciudades/regiones del recorrido se inyecten como "Visita: X" en un día cualquiera.
    const cleanedIntent: TripCreationIntent = {
      ...resolved.intent,
      mustSee: filterMustSeeAgainstRoute({ mustSee: resolved.intent.mustSee || [], baseCityByDay: fullStructure.baseCityByDay }),
    };

    // Creamos un resolved “slice” para que el generador produzca solo esos días.
    const sliceStart = addDaysIso(resolved.startDate, dayOffset);
    const sliceResolved: any = {
      ...resolved,
      intent: cleanedIntent,
      startDate: sliceStart,
      durationDays: count,
    };

    const prompts: string[] = [];
    const out = await generateExecutableItineraryFromStructure(sliceResolved, {
      provider,
      config,
      structure: sliceStructure as any,
      latencyMode: "preview",
      debug: { prompts },
    });

    const days = (out.itinerary.days || []).map((d) => ({
      ...d,
      day: typeof d.day === "number" ? d.day + dayOffset : d.day,
      date: typeof d.date === "string" && d.date ? d.date : addDaysIso(resolved.startDate, (typeof d.day === "number" ? d.day - 1 : 0) + dayOffset),
    }));

    if (dayOffset > 0 && days.length) {
      const prevBase = String(fullStructure.baseCityByDay[dayOffset - 1] || "").trim();
      const curBase = String(fullStructure.baseCityByDay[dayOffset] || "").trim();
      if (prevBase && curBase && prevBase.toLowerCase() !== curBase.toLowerCase()) {
        const first = days[0] as any;
        const items = Array.isArray(first?.items) ? [...first.items] : [];
        const hasTransport = items.some((it: any) => String(it?.activity_kind || "").toLowerCase() === "transport");
        if (!hasTransport) {
          const transportMode = guessIntercityTransportMode(prevBase, curBase);
          const transferDuration = transportMode === "flight" ? 240 : 180;
          items.unshift({
            title: `Traslado de ${prevBase} a ${curBase}`,
            activity_kind: "transport",
            place_name: `${prevBase} → ${curBase}`,
            address: `${prevBase} → ${curBase}, ${cleanCountryFromDestination(resolved.destination)}`,
            start_time: "08:30",
            duration_min: transferDuration,
            transport_mode: transportMode,
            notes: "Bloque reservado para el desplazamiento principal entre destinos. Reduce el resto de actividades de este día.",
          });
          const adjusted = adjustItemsAfterTransfer(items, transferDuration);
          if (adjusted.length > 3) adjusted.splice(3);
          days[0] = { ...first, items: adjusted };
        }
      }
    }

    if (shouldTrack) {
      await trackAiUsage({ supabase, userId, monthKey, provider, usage: out.usage });
    }

    return NextResponse.json({ status: "ok", dayOffset, dayCount: count, days, prompts });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo generar el chunk." }, { status: 500 });
  }
}

