 import { NextResponse } from "next/server";
 import { createClient } from "@/lib/supabase/server";
 import { requireTripAccess } from "@/lib/trip-access";
 
 async function extractNamesFromRows(rows: Record<string, unknown>[]) {
   const names = new Set<string>();
   for (const row of rows) {
     const possible = [row.display_name, row.name, row.full_name, row.username, row.email];
     for (const value of possible) {
       if (typeof value === "string" && value.trim()) {
         names.add(value.trim());
         break;
       }
     }
   }
   return Array.from(names);
 }
 
 async function loadRegisteredTravelersFromKnownTables(
   supabase: Awaited<ReturnType<typeof createClient>>,
   tripId: string
 ) {
   const attempts = [
     { table: "trip_participants", query: () => supabase.from("trip_participants").select("*").eq("trip_id", tripId) },
     { table: "trip_travelers", query: () => supabase.from("trip_travelers").select("*").eq("trip_id", tripId) },
     { table: "trip_members", query: () => supabase.from("trip_members").select("*").eq("trip_id", tripId) },
     { table: "trip_users", query: () => supabase.from("trip_users").select("*").eq("trip_id", tripId) },
   ] as const;
 
   for (const attempt of attempts) {
     try {
       const res = await attempt.query();
       if (!res.error) {
         const names = await extractNamesFromRows((res.data ?? []) as Record<string, unknown>[]);
         if (names.length) return names;
       }
     } catch {
       // try next
     }
   }
 
   return [];
 }
 
 export async function GET(request: Request) {
   try {
     const { searchParams } = new URL(request.url);
     const tripId = searchParams.get("tripId");
     if (!tripId) return NextResponse.json({ error: "Falta tripId" }, { status: 400 });
 
     await requireTripAccess(tripId);
     const supabase = await createClient();
 
     const [expensesRes, settlementsRes, travelers] = await Promise.all([
       supabase
         .from("trip_expenses")
         .select("*")
         .eq("trip_id", tripId)
         .order("expense_date", { ascending: false })
         .order("created_at", { ascending: false }),
       supabase
         .from("trip_expense_settlements")
         .select("*")
         .eq("trip_id", tripId)
         .order("created_at", { ascending: false }),
       loadRegisteredTravelersFromKnownTables(supabase, tripId),
     ]);
 
     if (expensesRes.error) throw new Error(expensesRes.error.message);
     if (settlementsRes.error) throw new Error(settlementsRes.error.message);
 
     return NextResponse.json({
       expenses: expensesRes.data || [],
       settlements: settlementsRes.data || [],
       registeredTravelers: travelers || [],
     });
   } catch (error) {
     return NextResponse.json(
       { error: error instanceof Error ? error.message : "No se pudieron cargar los gastos." },
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
       return NextResponse.json({ error: "No tienes permisos para crear gastos." }, { status: 403 });
     }
 
     const supabase = await createClient();
 
     const payload = {
       trip_id: tripId,
       title: typeof body?.title === "string" ? body.title.trim() : null,
       category: typeof body?.category === "string" ? body.category.trim() : "general",
       payer_name: typeof body?.payer_name === "string" ? body.payer_name.trim() : null,
       participant_names: Array.isArray(body?.participant_names) ? body.participant_names : [],
       paid_by_names: Array.isArray(body?.paid_by_names) ? body.paid_by_names : [],
       owed_by_names: Array.isArray(body?.owed_by_names) ? body.owed_by_names : [],
       amount: typeof body?.amount === "number" ? body.amount : Number(body?.amount ?? 0),
       currency: typeof body?.currency === "string" ? body.currency : "EUR",
       expense_date: typeof body?.expense_date === "string" ? body.expense_date : null,
       notes: typeof body?.notes === "string" ? body.notes : null,
       attachment_path: typeof body?.attachment_path === "string" ? body.attachment_path : null,
       attachment_name: typeof body?.attachment_name === "string" ? body.attachment_name : null,
       attachment_type: typeof body?.attachment_type === "string" ? body.attachment_type : null,
       analysis_data: body?.analysis_data ?? {},
     };
 
     if (!payload.title) return NextResponse.json({ error: "Falta title" }, { status: 400 });
 
     const { data, error } = await supabase.from("trip_expenses").insert(payload).select("*").single();
     if (error) throw new Error(error.message);
 
     return NextResponse.json({ expense: data }, { status: 201 });
   } catch (error) {
     return NextResponse.json(
       { error: error instanceof Error ? error.message : "No se pudo crear el gasto." },
       { status: 500 }
     );
   }
 }
 
