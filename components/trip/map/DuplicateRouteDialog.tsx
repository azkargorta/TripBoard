 "use client";
 
 import { useEffect, useMemo, useState } from "react";
 
 type TripMapRoute = {
   id: string;
   source?: "trip_routes" | "legacy_routes";
   route_day?: string | null;
   route_date?: string | null;
   departure_time?: string | null;
   title?: string | null;
   route_name?: string | null;
   travel_mode?: string | null;
   color?: string | null;
   origin_name?: string | null;
   origin_address?: string | null;
   origin_latitude?: number | null;
   origin_longitude?: number | null;
   stop_name?: string | null;
   stop_address?: string | null;
   stop_latitude?: number | null;
   stop_longitude?: number | null;
   destination_name?: string | null;
   destination_address?: string | null;
   destination_latitude?: number | null;
   destination_longitude?: number | null;
   distance_text?: string | null;
   duration_text?: string | null;
   arrival_time?: string | null;
   route_points?: { lat: number; lng: number }[] | null;
   path_points?: { lat: number; lng: number }[] | null;
   notes?: string | null;
 };
 
 type Props = {
   open: boolean;
   route: TripMapRoute | null;
   tripId: string;
   tripDates: string[];
   defaultDate?: string;
   onClose: () => void;
   onDuplicated: () => void;
 };
 
 export default function DuplicateRouteDialog({
   open,
   route,
   tripId,
   tripDates,
   defaultDate,
   onClose,
   onDuplicated,
 }: Props) {
   const [targetDate, setTargetDate] = useState(defaultDate || "");
   const [saving, setSaving] = useState(false);
   const [error, setError] = useState<string | null>(null);
 
   const dateOptions = useMemo(() => Array.from(new Set(tripDates)).sort(), [tripDates]);
 
   useEffect(() => {
     if (!open) return;
     setError(null);
     setSaving(false);
     setTargetDate(defaultDate || route?.route_day || route?.route_date || "");
   }, [defaultDate, open, route?.route_date, route?.route_day]);
 
   if (!open) return null;
 
   const canDuplicate = !!route && route.source === "trip_routes";
 
   async function submit() {
     if (!route || route.source !== "trip_routes") return;
     if (!targetDate) {
       setError("Selecciona un día para duplicar la ruta.");
       return;
     }
 
     setSaving(true);
     setError(null);
 
     try {
       const name = (route.route_name || route.title || "Ruta").trim();
       const body = {
         tripId,
         route_day: targetDate,
         route_date: targetDate,
         day_date: targetDate,
         title: `${name} (copia)`,
         route_name: `${name} (copia)`,
         name: `${name} (copia)`,
         departure_time: route.departure_time || null,
         start_time: route.departure_time || null,
         travel_mode: route.travel_mode || "DRIVING",
         mode: route.travel_mode || "DRIVING",
         notes: route.notes || null,
         color: route.color || null,
         origin_name: route.origin_name || null,
         origin_address: route.origin_address || null,
         origin_latitude: route.origin_latitude ?? null,
         origin_longitude: route.origin_longitude ?? null,
         stop_name: route.stop_name || null,
         stop_address: route.stop_address || null,
         stop_latitude: route.stop_latitude ?? null,
         stop_longitude: route.stop_longitude ?? null,
         destination_name: route.destination_name || null,
         destination_address: route.destination_address || null,
         destination_latitude: route.destination_latitude ?? null,
         destination_longitude: route.destination_longitude ?? null,
         path_points: Array.isArray(route.path_points) ? route.path_points : [],
         route_points: Array.isArray(route.route_points) ? route.route_points : [],
         distance_text: route.distance_text || null,
         duration_text: route.duration_text || null,
         arrival_time: route.arrival_time || null,
       };
 
       const resp = await fetch("/api/trip-routes", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify(body),
       });
       const text = await resp.text();
       let payload: any = null;
       try {
         payload = text ? JSON.parse(text) : null;
       } catch {
         payload = { error: text || "Respuesta no válida." };
       }
       if (!resp.ok) throw new Error(payload?.error || `Error ${resp.status}`);
       if (payload?.error) throw new Error(payload.error);
 
       onDuplicated();
       onClose();
     } catch (e) {
       setError(e instanceof Error ? e.message : "No se pudo duplicar la ruta.");
     } finally {
       setSaving(false);
     }
   }
 
   return (
     <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 p-4">
       <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl">
         <div className="flex items-start justify-between gap-3">
           <div>
             <h3 className="text-lg font-extrabold text-slate-950">Duplicar ruta</h3>
             <p className="mt-1 text-sm text-slate-600">
               {canDuplicate ? (
                 <>
                   Ruta: <span className="font-semibold text-slate-900">{route?.route_name || route?.title || "Ruta"}</span>
                 </>
               ) : (
                 "Esta ruta no se puede duplicar (legacy)."
               )}
             </p>
           </div>
           <button
             type="button"
             onClick={onClose}
             className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900"
           >
             Cerrar
           </button>
         </div>
 
         <div className="mt-4 grid gap-3">
           <label className="text-xs font-semibold text-slate-700">
             Día destino
             <select
               value={targetDate}
               onChange={(e) => setTargetDate(e.target.value)}
               className="mt-2 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900"
               disabled={!canDuplicate}
             >
               <option value="">Selecciona…</option>
               {dateOptions.map((d) => (
                 <option key={d} value={d}>
                   {d}
                 </option>
               ))}
             </select>
           </label>
 
           <div className="flex gap-3">
             <button
               type="button"
               onClick={submit}
               disabled={!canDuplicate || saving}
               className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-slate-900 px-4 font-extrabold text-white disabled:opacity-60"
             >
               {saving ? "Duplicando..." : "Crear copia"}
             </button>
             <button
               type="button"
               onClick={onClose}
               className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 font-extrabold text-slate-900"
             >
               Cancelar
             </button>
           </div>
 
           {error ? (
             <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
           ) : null}
         </div>
       </div>
     </div>
   );
 }

