 import { NextResponse } from "next/server";
 import { createClient } from "@/lib/supabase/server";
 import { requireTripAccess } from "@/lib/trip-access";
 
 export async function DELETE(_request: Request, { params }: { params: { resourceId: string } }) {
   try {
     const supabase = await createClient();
 
     const { data: row, error: rowError } = await supabase
       .from("trip_resources")
       .select("trip_id")
       .eq("id", params.resourceId)
       .maybeSingle();
     if (rowError) throw new Error(rowError.message);
     if (!row?.trip_id) return NextResponse.json({ error: "Recurso no encontrado." }, { status: 404 });
 
     const access = await requireTripAccess(row.trip_id);
     if (access.role === "viewer") {
       return NextResponse.json({ error: "No tienes permisos para borrar recursos." }, { status: 403 });
     }
 
     const { error } = await supabase.from("trip_resources").delete().eq("id", params.resourceId);
     if (error) throw new Error(error.message);
 
     return NextResponse.json({ ok: true });
   } catch (error) {
     return NextResponse.json(
       { error: error instanceof Error ? error.message : "No se pudo borrar el recurso." },
       { status: 500 }
     );
   }
 }
 
