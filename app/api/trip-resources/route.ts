 import { NextResponse } from "next/server";
 import { createClient } from "@/lib/supabase/server";
 import { requireTripAccess } from "@/lib/trip-access";
 
 export async function GET(request: Request) {
   try {
     const { searchParams } = new URL(request.url);
     const tripId = searchParams.get("tripId");
     if (!tripId) return NextResponse.json({ error: "Falta tripId" }, { status: 400 });
 
     await requireTripAccess(tripId);
     const supabase = await createClient();
 
     const [{ data: resources, error: resourcesError }, { data: reservations, error: reservationsError }] =
       await Promise.all([
         supabase
           .from("trip_resources")
           .select("*")
           .eq("trip_id", tripId)
           .order("created_at", { ascending: false }),
         supabase
           .from("trip_reservations")
           .select("*")
           .eq("trip_id", tripId)
           .order("check_in_date", { ascending: true }),
       ]);
 
     if (resourcesError) throw new Error(resourcesError.message);
     if (reservationsError) throw new Error(reservationsError.message);
 
     return NextResponse.json({ resources: resources || [], reservations: reservations || [] });
   } catch (error) {
     return NextResponse.json(
       { error: error instanceof Error ? error.message : "No se pudieron cargar recursos y reservas." },
       { status: 500 }
     );
   }
 }
 
 export async function POST(request: Request) {
   try {
     const body = await request.json();
     const tripId = typeof body?.tripId === "string" ? body.tripId : body?.trip_id;
     if (!tripId) return NextResponse.json({ error: "Falta tripId" }, { status: 400 });
 
     const access = await requireTripAccess(tripId);
     if (access.role === "viewer") {
       return NextResponse.json({ error: "No tienes permisos para crear recursos." }, { status: 403 });
     }
 
     const supabase = await createClient();
     const payload = {
       trip_id: tripId,
       title: typeof body?.title === "string" ? body.title.trim() : null,
       resource_type: typeof body?.resource_type === "string" ? body.resource_type : "document",
       category: typeof body?.category === "string" ? body.category : null,
       notes: typeof body?.notes === "string" ? body.notes : null,
       file_path: typeof body?.file_path === "string" ? body.file_path : null,
       file_url: typeof body?.file_url === "string" ? body.file_url : null,
       mime_type: typeof body?.mime_type === "string" ? body.mime_type : null,
       detected_document_type: typeof body?.detected_document_type === "string" ? body.detected_document_type : null,
       detected_data: body?.detected_data ?? {},
       linked_reservation_id: typeof body?.linked_reservation_id === "string" ? body.linked_reservation_id : null,
       created_by_user_id: access.userId,
     };
 
     if (!payload.title) return NextResponse.json({ error: "Falta title" }, { status: 400 });
 
     const { data, error } = await supabase.from("trip_resources").insert(payload).select("*").single();
     if (error) throw new Error(error.message);
 
     return NextResponse.json({ resource: data }, { status: 201 });
   } catch (error) {
     return NextResponse.json(
       { error: error instanceof Error ? error.message : "No se pudo crear el recurso." },
       { status: 500 }
     );
   }
 }
 
