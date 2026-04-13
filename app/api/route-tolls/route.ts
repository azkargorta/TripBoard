 import { NextResponse } from "next/server";
 import { requireTripAccess } from "@/lib/trip-access";
 import { createClient } from "@/lib/supabase/server";
 
 type LatLng = { lat: number; lng: number };
type Money = { currencyCode: string; units: string; nanos?: number };
 
 function isLatLng(value: any): value is LatLng {
   return (
     value &&
     typeof value.lat === "number" &&
     Number.isFinite(value.lat) &&
     typeof value.lng === "number" &&
     Number.isFinite(value.lng)
   );
 }
 
 function buildComputeRoutesBody(params: {
   origin: LatLng;
   destination: LatLng;
   stop?: LatLng | null;
   avoidTolls: boolean;
   tollPasses?: string[];
 }) {
   const intermediates = params.stop ? [{ location: { latLng: { latitude: params.stop.lat, longitude: params.stop.lng } } }] : [];
   return {
     origin: { location: { latLng: { latitude: params.origin.lat, longitude: params.origin.lng } } },
     destination: { location: { latLng: { latitude: params.destination.lat, longitude: params.destination.lng } } },
     intermediates,
     travelMode: "DRIVE",
     routingPreference: "TRAFFIC_AWARE",
     routeModifiers: {
       avoidTolls: !!params.avoidTolls,
       ...(params.tollPasses?.length ? { tollPasses: params.tollPasses } : {}),
     },
     extraComputations: ["TOLLS"],
   };
 }
 
async function fetchTollGuruEstimate(params: {
  origin: LatLng;
  destination: LatLng;
  stop?: LatLng | null;
}) {
  const apiKey = process.env.TOLLGURU_API_KEY || "";
  if (!apiKey) return null;

  // TollGuru: https://apis.tollguru.com/toll/v2/origin-destination-waypoints
  // Nota: el esquema puede variar por región; aquí parseamos de forma defensiva.
  const body = {
    from: { lat: params.origin.lat, lng: params.origin.lng },
    to: { lat: params.destination.lat, lng: params.destination.lng },
    ...(params.stop ? { waypoints: [{ lat: params.stop.lat, lng: params.stop.lng }] } : {}),
    vehicle: { type: "2AxlesAuto" },
  };

  const resp = await fetch("https://apis.tollguru.com/toll/v2/origin-destination-waypoints", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify(body),
  });

  const text = await resp.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }

  if (!resp.ok) return null;

  const route0 = payload?.route?.[0] ?? payload?.routes?.[0] ?? null;
  const tollCost =
    route0?.costs?.tollCost ??
    route0?.costs?.tagAndCash ??
    route0?.costs?.minimumTollCost ??
    payload?.summary?.costs?.tollCost ??
    null;
  const currency =
    route0?.costs?.currency ??
    route0?.currency ??
    payload?.summary?.costs?.currency ??
    payload?.currency ??
    null;

  if (typeof tollCost !== "number" || !Number.isFinite(tollCost) || tollCost < 0) return null;
  const currencyCode = typeof currency === "string" && currency.trim() ? currency.trim().toUpperCase() : "EUR";

  // Convertimos a Money (units/nanos) para reutilizar UI
  const units = String(Math.trunc(tollCost));
  const nanos = Math.round((tollCost - Math.trunc(tollCost)) * 1_000_000_000);
  return { currencyCode, units, nanos } satisfies Money;
}

 export async function POST(request: Request) {
   try {
    // Premium required: usa Google Routes/TollGuru (coste).
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    const { data: profileRow } = await supabase
      .from("profiles")
      .select("is_premium")
      .eq("id", user.id)
      .maybeSingle();
    if (!Boolean((profileRow as any)?.is_premium)) {
      return NextResponse.json(
        { error: "Necesitas Premium para calcular peajes/rutas.", code: "PREMIUM_REQUIRED" },
        { status: 402 }
      );
    }

    const key =
      process.env.GOOGLE_ROUTES_API_KEY ||
      process.env.GOOGLE_MAPS_API_KEY ||
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
      "";
     if (!key) {
       return NextResponse.json(
         { error: "Falta configurar GOOGLE_ROUTES_API_KEY en el servidor." },
         { status: 501 }
       );
     }
 
     const body = await request.json();
     const tripId = typeof body?.tripId === "string" ? body.tripId : null;
     if (!tripId) return NextResponse.json({ error: "Falta tripId" }, { status: 400 });
 
     await requireTripAccess(tripId);
 
     const origin = body?.origin;
     const destination = body?.destination;
     const stop = body?.stop;
     const avoidTolls = !!body?.avoidTolls;
     const tollPasses = Array.isArray(body?.tollPasses) ? body.tollPasses.filter((x: any) => typeof x === "string") : [];
 
     if (!isLatLng(origin) || !isLatLng(destination)) {
       return NextResponse.json({ error: "Origen y destino deben ser {lat,lng}." }, { status: 400 });
     }
     if (stop != null && !isLatLng(stop)) {
       return NextResponse.json({ error: "stop debe ser {lat,lng} o null." }, { status: 400 });
     }
 
     const computeBody = buildComputeRoutesBody({
       origin,
       destination,
       stop: stop ?? null,
       avoidTolls,
       tollPasses,
     });
 
     // Importante: Routes API exige FieldMask.
     const resp = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
       method: "POST",
       headers: {
         "Content-Type": "application/json",
         "X-Goog-Api-Key": key,
         "X-Goog-FieldMask": "routes.travelAdvisory.tollInfo,routes.legs.travelAdvisory.tollInfo",
       },
       body: JSON.stringify(computeBody),
     });
 
     const text = await resp.text();
     let payload: any = null;
     try {
       payload = text ? JSON.parse(text) : null;
     } catch {
       payload = { error: text || "Respuesta no JSON." };
     }
 
     if (!resp.ok) {
       return NextResponse.json({ error: payload?.error?.message || payload?.error || `Error ${resp.status}` }, { status: 502 });
     }
 
     const tollInfo = payload?.routes?.[0]?.travelAdvisory?.tollInfo || null;
     const estimatedPrice = Array.isArray(tollInfo?.estimatedPrice) ? tollInfo.estimatedPrice : [];
 
     const hasTolls = !!tollInfo;
     const hasEstimate = !!(tollInfo && estimatedPrice.length);

     // Fallback opcional: si Google no devuelve estimatedPrice, intentar con TollGuru (si hay key).
     let fallbackPrice: Money | null = null;
     if (hasTolls && !hasEstimate) {
       try {
         fallbackPrice = await fetchTollGuruEstimate({ origin, destination, stop: stop ?? null });
       } catch {
         fallbackPrice = null;
       }
     }

     // Si no hay estimatedPrice, puede significar “hay peajes pero sin precio” o “no hay peajes”.
     return NextResponse.json({
       tollInfo: tollInfo ? { estimatedPrice } : null,
       hasTolls,
       hasEstimate,
       fallbackEstimatedPrice: fallbackPrice,
     });
   } catch (error) {
     return NextResponse.json(
       { error: error instanceof Error ? error.message : "No se pudo calcular el peaje." },
       { status: 500 }
     );
   }
 }

