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
 
 export async function PATCH(request: Request, { params }: { params: { reservationId: string } }) {
   try {
     const body = await request.json();
     const supabase = await createClient();
 
     const { data: row, error: rowError } = await supabase
       .from("trip_reservations")
       .select("trip_id, reservation_type, sync_to_plan")
       .eq("id", params.reservationId)
       .maybeSingle();
     if (rowError) throw new Error(rowError.message);
     if (!row?.trip_id) return NextResponse.json({ error: "Reserva no encontrada." }, { status: 404 });
 
     const access = await requireTripAccess(row.trip_id);
     if (access.role === "viewer") {
       return NextResponse.json({ error: "No tienes permisos para editar reservas." }, { status: 403 });
     }
 
     const patch: Record<string, unknown> = {};
     const assign = (k: string, v: unknown) => {
       if (v !== undefined) patch[k] = v;
     };
 
     assign("provider_name", typeof body?.provider_name === "string" ? body.provider_name : undefined);
     assign("reservation_name", typeof body?.reservation_name === "string" ? body.reservation_name.trim() : undefined);
     assign("reservation_code", typeof body?.reservation_code === "string" ? body.reservation_code : undefined);
     assign("address", typeof body?.address === "string" ? body.address : undefined);
     assign("city", typeof body?.city === "string" ? body.city : undefined);
     assign("country", typeof body?.country === "string" ? body.country : undefined);
     assign("check_in_date", typeof body?.check_in_date === "string" ? body.check_in_date : undefined);
     assign("check_in_time", typeof body?.check_in_time === "string" ? body.check_in_time : undefined);
     assign("check_out_date", typeof body?.check_out_date === "string" ? body.check_out_date : undefined);
     assign("check_out_time", typeof body?.check_out_time === "string" ? body.check_out_time : undefined);
     assign("nights", calculateNights(body?.check_in_date ?? null, body?.check_out_date ?? null));
     assign("guests", typeof body?.guests === "number" ? body.guests : undefined);
     assign("total_amount", typeof body?.total_amount === "number" ? body.total_amount : undefined);
     assign("currency", typeof body?.currency === "string" ? body.currency : undefined);
     assign("payment_status", body?.payment_status === "paid" ? "paid" : body?.payment_status === "pending" ? "pending" : undefined);
     assign("notes", typeof body?.notes === "string" ? body.notes : undefined);
     assign("sync_to_plan", typeof body?.sync_to_plan === "boolean" ? body.sync_to_plan : undefined);
     assign("latitude", typeof body?.latitude === "number" ? body.latitude : undefined);
     assign("longitude", typeof body?.longitude === "number" ? body.longitude : undefined);
 
     const { data, error } = await supabase
       .from("trip_reservations")
       .update(patch)
       .eq("id", params.reservationId)
       .select("*")
       .single();
     if (error) throw new Error(error.message);
 
     if (data?.reservation_type === "lodging") {
       if (data?.sync_to_plan) await upsertLodgingPlanActivity(supabase, data);
       else await removeLodgingPlanActivity(supabase, data.id);
     }
 
     return NextResponse.json({ reservation: data });
   } catch (error) {
     return NextResponse.json(
       { error: error instanceof Error ? error.message : "No se pudo actualizar la reserva." },
       { status: 500 }
     );
   }
 }
 
 export async function DELETE(_request: Request, { params }: { params: { reservationId: string } }) {
   try {
     const supabase = await createClient();
 
     const { data: row, error: rowError } = await supabase
       .from("trip_reservations")
       .select("trip_id, reservation_type")
       .eq("id", params.reservationId)
       .maybeSingle();
     if (rowError) throw new Error(rowError.message);
     if (!row?.trip_id) return NextResponse.json({ error: "Reserva no encontrada." }, { status: 404 });
 
     const access = await requireTripAccess(row.trip_id);
     if (access.role === "viewer") {
       return NextResponse.json({ error: "No tienes permisos para borrar reservas." }, { status: 403 });
     }
 
     if (row.reservation_type === "lodging") {
       await removeLodgingPlanActivity(supabase, params.reservationId).catch(() => null);
     }
 
     const { error } = await supabase.from("trip_reservations").delete().eq("id", params.reservationId);
     if (error) throw new Error(error.message);
 
     return NextResponse.json({ ok: true });
   } catch (error) {
     return NextResponse.json(
       { error: error instanceof Error ? error.message : "No se pudo eliminar la reserva." },
       { status: 500 }
     );
   }
 }
 
