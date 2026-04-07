 import { NextResponse } from "next/server";
 import { createClient } from "@/lib/supabase/server";
 import { requireTripAccess } from "@/lib/trip-access";
 
 export async function PATCH(request: Request, { params }: { params: { expenseId: string } }) {
   try {
     const body = await request.json();
     const supabase = await createClient();
 
     const { data: row, error: rowError } = await supabase
       .from("trip_expenses")
       .select("trip_id")
       .eq("id", params.expenseId)
       .maybeSingle();
     if (rowError) throw new Error(rowError.message);
     if (!row?.trip_id) return NextResponse.json({ error: "Gasto no encontrado." }, { status: 404 });
 
     const access = await requireTripAccess(row.trip_id);
     if (access.role === "viewer") {
       return NextResponse.json({ error: "No tienes permisos para editar gastos." }, { status: 403 });
     }
 
     const patch: Record<string, unknown> = {};
     const assign = (k: string, v: unknown) => {
       if (v !== undefined) patch[k] = v;
     };
 
     assign("title", typeof body?.title === "string" ? body.title.trim() : undefined);
     assign("category", typeof body?.category === "string" ? body.category.trim() : undefined);
     assign("payer_name", typeof body?.payer_name === "string" ? body.payer_name.trim() : undefined);
     assign("participant_names", Array.isArray(body?.participant_names) ? body.participant_names : undefined);
     assign("paid_by_names", Array.isArray(body?.paid_by_names) ? body.paid_by_names : undefined);
     assign("owed_by_names", Array.isArray(body?.owed_by_names) ? body.owed_by_names : undefined);
     assign("amount", typeof body?.amount === "number" ? body.amount : undefined);
     assign("currency", typeof body?.currency === "string" ? body.currency : undefined);
     assign("expense_date", typeof body?.expense_date === "string" ? body.expense_date : undefined);
     assign("notes", typeof body?.notes === "string" ? body.notes : undefined);
     assign("attachment_path", body?.attachment_path === null || typeof body?.attachment_path === "string" ? body.attachment_path : undefined);
     assign("attachment_name", body?.attachment_name === null || typeof body?.attachment_name === "string" ? body.attachment_name : undefined);
     assign("attachment_type", body?.attachment_type === null || typeof body?.attachment_type === "string" ? body.attachment_type : undefined);
     assign("analysis_data", body?.analysis_data !== undefined ? body.analysis_data : undefined);
 
     const { data, error } = await supabase
       .from("trip_expenses")
       .update(patch)
       .eq("id", params.expenseId)
       .select("*")
       .single();
     if (error) throw new Error(error.message);
 
     return NextResponse.json({ expense: data });
   } catch (error) {
     return NextResponse.json(
       { error: error instanceof Error ? error.message : "No se pudo actualizar el gasto." },
       { status: 500 }
     );
   }
 }
 
 export async function DELETE(_request: Request, { params }: { params: { expenseId: string } }) {
   try {
     const supabase = await createClient();
 
     const { data: row, error: rowError } = await supabase
       .from("trip_expenses")
       .select("trip_id")
       .eq("id", params.expenseId)
       .maybeSingle();
     if (rowError) throw new Error(rowError.message);
     if (!row?.trip_id) return NextResponse.json({ error: "Gasto no encontrado." }, { status: 404 });
 
     const access = await requireTripAccess(row.trip_id);
     if (access.role === "viewer") {
       return NextResponse.json({ error: "No tienes permisos para borrar gastos." }, { status: 403 });
     }
 
     const { error } = await supabase.from("trip_expenses").delete().eq("id", params.expenseId);
     if (error) throw new Error(error.message);
 
     return NextResponse.json({ ok: true });
   } catch (error) {
     return NextResponse.json(
       { error: error instanceof Error ? error.message : "No se pudo eliminar el gasto." },
       { status: 500 }
     );
   }
 }
 
