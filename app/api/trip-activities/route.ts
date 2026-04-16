 import { NextResponse } from "next/server";
 import { createClient } from "@/lib/supabase/server";
 import { requireTripAccess } from "@/lib/trip-access";
 
async function safeInsertAudit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: {
    trip_id: string;
    entity_type: string;
    entity_id: string;
    action: "create" | "update" | "delete";
    summary?: string | null;
    diff?: any;
    actor_user_id?: string | null;
    actor_email?: string | null;
  }
) {
  try {
    await supabase.from("trip_audit_log").insert({
      trip_id: input.trip_id,
      entity_type: input.entity_type,
      entity_id: input.entity_id,
      action: input.action,
      summary: input.summary ?? null,
      diff: input.diff ?? null,
      actor_user_id: input.actor_user_id ?? null,
      actor_email: input.actor_email ?? null,
    });
  } catch {
    // no-op
  }
}

 export async function GET(request: Request) {
   try {
     const { searchParams } = new URL(request.url);
     const tripId = searchParams.get("tripId");
     if (!tripId) return NextResponse.json({ error: "Falta tripId" }, { status: 400 });
 
     await requireTripAccess(tripId);
     const supabase = await createClient();
 
    const [{ data: trip, error: tripError }, { data: activities, error: activitiesError }] = await Promise.all([
      supabase.from("trips").select("id, name, destination").eq("id", tripId).single(),
      supabase
        .from("trip_activities")
        .select("*")
        .eq("trip_id", tripId)
        .order("activity_date", { ascending: true })
        .order("activity_time", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);
 
    if (tripError) throw new Error(tripError.message);
    if (activitiesError) throw new Error(activitiesError.message);

    return NextResponse.json({ trip: trip || null, activities: activities || [] });
   } catch (error) {
     return NextResponse.json(
       { error: error instanceof Error ? error.message : "No se pudo cargar el plan." },
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
    if (!access.can_manage_plan) {
       return NextResponse.json({ error: "No tienes permisos para crear actividades." }, { status: 403 });
     }
 
     const supabase = await createClient();
    const { data: actor } = await supabase.auth.getUser();
    const ratingRaw = body?.rating;
    const rating =
      typeof ratingRaw === "number" && Number.isFinite(ratingRaw) && ratingRaw >= 1 && ratingRaw <= 5
        ? Math.round(ratingRaw)
        : null;

     const payload = {
       trip_id: tripId,
       title: typeof body?.title === "string" ? body.title.trim() : null,
       description: typeof body?.description === "string" ? body.description.trim() : null,
      rating,
      comment: typeof body?.comment === "string" ? body.comment.trim() : null,
       activity_date: typeof body?.activity_date === "string" ? body.activity_date : null,
       activity_time: typeof body?.activity_time === "string" ? body.activity_time : null,
       place_name: typeof body?.place_name === "string" ? body.place_name.trim() : null,
       address: typeof body?.address === "string" ? body.address.trim() : null,
       latitude: typeof body?.latitude === "number" ? body.latitude : null,
       longitude: typeof body?.longitude === "number" ? body.longitude : null,
       activity_type: typeof body?.activity_type === "string" ? body.activity_type : null,
       activity_kind: typeof body?.activity_kind === "string" ? body.activity_kind : null,
       source: typeof body?.source === "string" ? body.source : "manual",
       created_by_user_id: typeof body?.created_by_user_id === "string" ? body.created_by_user_id : access.userId,
     };
 
     if (!payload.title) return NextResponse.json({ error: "Falta title" }, { status: 400 });
 
    const { data, error } = await supabase.from("trip_activities").insert(payload).select("*").single();
    if (error) {
      const msg = error.message || "No se pudo crear la actividad.";
      if (msg.toLowerCase().includes("column") && (msg.toLowerCase().includes("rating") || msg.toLowerCase().includes("comment"))) {
        return NextResponse.json(
          {
            error:
              "La tabla `trip_activities` no tiene las columnas `rating`/`comment`. Ejecuta el script `docs/tripboard_plan_ratings_comments.sql` en la SQL editor de Supabase y vuelve a probar.",
          },
          { status: 400 }
        );
      }
      throw new Error(msg);
    }
 
    await safeInsertAudit(supabase, {
      trip_id: tripId,
      entity_type: "activity",
      entity_id: String(data.id),
      action: "create",
      summary: `Creó plan: ${String(data.title || "").trim() || "Sin título"}`,
      diff: { after: data },
      actor_user_id: actor?.user?.id ?? null,
      actor_email: actor?.user?.email ?? null,
    });

     return NextResponse.json({ activity: data });
   } catch (error) {
     return NextResponse.json(
       { error: error instanceof Error ? error.message : "No se pudo crear la actividad." },
       { status: 500 }
     );
   }
 }
 
