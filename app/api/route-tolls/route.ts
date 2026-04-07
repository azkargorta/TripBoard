 import { NextResponse } from "next/server";
 import { requireTripAccess } from "@/lib/trip-access";
 
 type LatLng = { lat: number; lng: number };
 
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
 
 export async function POST(request: Request) {
   try {
     const key = process.env.GOOGLE_ROUTES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "";
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
 
     // Si no hay estimatedPrice, puede significar “hay peajes pero sin precio” o “no hay peajes”.
     return NextResponse.json({
       tollInfo: tollInfo ? { estimatedPrice } : null,
     });
   } catch (error) {
     return NextResponse.json(
       { error: error instanceof Error ? error.message : "No se pudo calcular el peaje." },
       { status: 500 }
     );
   }
 }

