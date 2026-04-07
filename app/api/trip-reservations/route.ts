 import { NextResponse } from "next/server";
 import { createClient } from "@/lib/supabase/server";
 import { requireTripAccess } from "@/lib/trip-access";
 
 function calculateNights(checkInDate?: string | null, checkOutDate?: string | null) {
   if (!checkInDate || !checkOutDate) return null;
   const start = new Date(checkInDate);
   const end = new Date(checkOutDate);
   const diffMs = end.getTime() - start.getTime();
   if (Number.isNaN(diffMs) || diffMs < 0) return null;
   return Math.round(diffMs / (1000 * 60 * 60 * 24));
 }
 
 async function upsertLodgingPlanActivity(
   supabase: Awaited<ReturnType<typeof createClient>>,
   reservation: any
 ) {
   const { data: existing, error: existingError } = await supabase
     .from("trip_activities")
     .select("id")
     .eq("linked_reservation_id", reservation.id)
     .maybeSingle();
   if (existingError) throw new Error(existingError.message);
 
   const payload = {
     trip_id: reservation.trip_id,
     linked_reservation_id: reservation.id,
     title: `Check-in · ${reservation.reservation_name}`,
     description: reservation.notes || null,
     activity_date: reservation.check_in_date || null,
     activity_time: reservation.check_in_time || null,
     place_name: reservation.reservation_name,
     address: [reservation.address, reservation.city, reservation.country].filter(Boolean).join(", ") || null,
     latitude: reservation.latitude ?? null,
     longitude: reservation.longitude ?? null,
     activity_type: "lodging",
     activity_kind: "lodging",
     source: "reservation",
   };
 
   if (existing?.id) {
     const { error } = await supabase.from("trip_activities").update(payload).eq("id", existing.id);
     if (error) throw new Error(error.message);
   } else {
     const { error } = await supabase.from("trip_activities").insert(payload);
     if (error) throw new Error(error.message);
   }
 }
 
 async function removeLodgingPlanActivity(
   supabase: Awaited<ReturnType<typeof createClient>>,
   reservationId: string
 ) {
   const { error } = await supabase.from("trip_activities").delete().eq("linked_reservation_id", reservationId);
   if (error) throw new Error(error.message);
 }
 
 export async function POST(request: Request) {
   try {
     const body = await request.json();
     const tripId = typeof body?.tripId === "string" ? body.tripId : body?.trip_id;
     if (!tripId) return NextResponse.json({ error: "Falta tripId" }, { status: 400 });
 
     const access = await requireTripAccess(tripId);
     if (access.role === "viewer") {
       return NextResponse.json({ error: "No tienes permisos para crear reservas." }, { status: 403 });
     }
 
     const supabase = await createClient();
     const reservationType = typeof body?.reservation_type === "string" ? body.reservation_type : "lodging";
     const payload = {
       trip_id: tripId,
       resource_id: typeof body?.resource_id === "string" ? body.resource_id : null,
       reservation_type: reservationType,
       provider_name: typeof body?.provider_name === "string" ? body.provider_name : null,
       reservation_name: typeof body?.reservation_name === "string" ? body.reservation_name.trim() : null,
       reservation_code: typeof body?.reservation_code === "string" ? body.reservation_code : null,
       address: typeof body?.address === "string" ? body.address : null,
       city: typeof body?.city === "string" ? body.city : null,
       country: typeof body?.country === "string" ? body.country : null,
       check_in_date: typeof body?.check_in_date === "string" ? body.check_in_date : null,
       check_in_time: typeof body?.check_in_time === "string" ? body.check_in_time : null,
       check_out_date: typeof body?.check_out_date === "string" ? body.check_out_date : null,
       check_out_time: typeof body?.check_out_time === "string" ? body.check_out_time : null,
       nights: calculateNights(body?.check_in_date ?? null, body?.check_out_date ?? null),
       guests: typeof body?.guests === "number" ? body.guests : null,
       total_amount: typeof body?.total_amount === "number" ? body.total_amount : null,
       currency: typeof body?.currency === "string" ? body.currency : "EUR",
       payment_status: body?.payment_status === "paid" ? "paid" : "pending",
       notes: typeof body?.notes === "string" ? body.notes : null,
       detected_document_type: typeof body?.detected_document_type === "string" ? body.detected_document_type : null,
       detected_data: body?.detected_data ?? {},
       created_by_user_id: access.userId,
       sync_to_plan: typeof body?.sync_to_plan === "boolean" ? body.sync_to_plan : reservationType === "lodging",
       latitude: typeof body?.latitude === "number" ? body.latitude : null,
       longitude: typeof body?.longitude === "number" ? body.longitude : null,
     };
 
     if (!payload.reservation_name) {
       return NextResponse.json({ error: "Falta reservation_name" }, { status: 400 });
     }
 
     const { data, error } = await supabase.from("trip_reservations").insert(payload).select("*").single();
     if (error) throw new Error(error.message);
 
     if (data?.reservation_type === "lodging") {
       if (data?.sync_to_plan) await upsertLodgingPlanActivity(supabase, data);
       else await removeLodgingPlanActivity(supabase, data.id);
     }
 
     return NextResponse.json({ reservation: data }, { status: 201 });
   } catch (error) {
     return NextResponse.json(
       { error: error instanceof Error ? error.message : "No se pudo crear la reserva." },
       { status: 500 }
     );
   }
 }
 
