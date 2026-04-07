 import { NextResponse } from "next/server";
 import { createClient } from "@/lib/supabase/server";
 import { requireTripAccess } from "@/lib/trip-access";
 
 export async function PATCH(request: Request, { params }: { params: { activityId: string } }) {
   try {
     const body = await request.json();
     const supabase = await createClient();
 
     const { data: row, error: rowError } = await supabase
       .from("trip_activities")
       .select("trip_id")
       .eq("id", params.activityId)
       .maybeSingle();
     if (rowError) throw new Error(rowError.message);
     if (!row?.trip_id) return NextResponse.json({ error: "Actividad no encontrada." }, { status: 404 });
 
     const access = await requireTripAccess(row.trip_id);
     if (access.role === "viewer") {
       return NextResponse.json({ error: "No tienes permisos para editar actividades." }, { status: 403 });
     }
 
     const patch: Record<string, unknown> = {};
     const assign = (k: string, v: unknown) => {
       if (v !== undefined) patch[k] = v;
     };
 
     assign("title", typeof body?.title === "string" ? body.title.trim() : undefined);
     assign("description", typeof body?.description === "string" ? body.description.trim() : undefined);
     assign("activity_date", typeof body?.activity_date === "string" ? body.activity_date : undefined);
     assign("activity_time", typeof body?.activity_time === "string" ? body.activity_time : undefined);
     assign("place_name", typeof body?.place_name === "string" ? body.place_name.trim() : undefined);
     assign("address", typeof body?.address === "string" ? body.address.trim() : undefined);
     assign("latitude", typeof body?.latitude === "number" ? body.latitude : undefined);
     assign("longitude", typeof body?.longitude === "number" ? body.longitude : undefined);
     assign("activity_type", typeof body?.activity_type === "string" ? body.activity_type : undefined);
     assign("activity_kind", typeof body?.activity_kind === "string" ? body.activity_kind : undefined);
 
     const { data, error } = await supabase.from("trip_activities").update(patch).eq("id", params.activityId).select("*").single();
     if (error) throw new Error(error.message);
 
     return NextResponse.json({ activity: data });
   } catch (error) {
     return NextResponse.json(
       { error: error instanceof Error ? error.message : "No se pudo actualizar la actividad." },
       { status: 500 }
     );
   }
 }
 
 export async function DELETE(_request: Request, { params }: { params: { activityId: string } }) {
   try {
     const supabase = await createClient();
 
     const { data: row, error: rowError } = await supabase
       .from("trip_activities")
       .select("trip_id")
       .eq("id", params.activityId)
       .maybeSingle();
     if (rowError) throw new Error(rowError.message);
     if (!row?.trip_id) return NextResponse.json({ error: "Actividad no encontrada." }, { status: 404 });
 
     const access = await requireTripAccess(row.trip_id);
     if (access.role === "viewer") {
       return NextResponse.json({ error: "No tienes permisos para borrar actividades." }, { status: 403 });
     }
 
     const { error } = await supabase.from("trip_activities").delete().eq("id", params.activityId);
     if (error) throw new Error(error.message);
 
     return NextResponse.json({ ok: true });
   } catch (error) {
     return NextResponse.json(
       { error: error instanceof Error ? error.message : "No se pudo borrar la actividad." },
       { status: 500 }
     );
   }
 }
 
