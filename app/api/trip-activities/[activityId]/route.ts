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

 export async function PATCH(request: Request, { params }: { params: { activityId: string } }) {
   try {
     const body = await request.json();
     const supabase = await createClient();
    const { data: actor } = await supabase.auth.getUser();
 
     const { data: row, error: rowError } = await supabase
       .from("trip_activities")
      .select("*")
       .eq("id", params.activityId)
       .maybeSingle();
     if (rowError) throw new Error(rowError.message);
     if (!row?.trip_id) return NextResponse.json({ error: "Actividad no encontrada." }, { status: 404 });
 
     const access = await requireTripAccess(row.trip_id);
    if (!access.can_manage_plan) {
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
    assign(
      "rating",
      typeof body?.rating === "number" &&
        Number.isFinite(body.rating) &&
        body.rating >= 1 &&
        body.rating <= 5
        ? Math.round(body.rating)
        : body?.rating === null
          ? null
          : undefined
    );
    assign("comment", typeof body?.comment === "string" ? body.comment.trim() : body?.comment === null ? null : undefined);
 
    const { data, error } = await supabase
      .from("trip_activities")
      .update(patch)
      .eq("id", params.activityId)
      .select("*")
      .single();
    if (error) {
      const msg = error.message || "No se pudo actualizar la actividad.";
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
      trip_id: String(row.trip_id),
      entity_type: "activity",
      entity_id: String(data.id),
      action: "update",
      summary: `Actualizó plan: ${String(data.title || "").trim() || "Sin título"}`,
      diff: { before: row, patch, after: data },
      actor_user_id: actor?.user?.id ?? null,
      actor_email: actor?.user?.email ?? null,
    });

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
    const { data: actor } = await supabase.auth.getUser();
 
     const { data: row, error: rowError } = await supabase
       .from("trip_activities")
      .select("*")
       .eq("id", params.activityId)
       .maybeSingle();
     if (rowError) throw new Error(rowError.message);
     if (!row?.trip_id) return NextResponse.json({ error: "Actividad no encontrada." }, { status: 404 });
 
     const access = await requireTripAccess(row.trip_id);
    if (!access.can_manage_plan) {
       return NextResponse.json({ error: "No tienes permisos para borrar actividades." }, { status: 403 });
     }
 
     const { error } = await supabase.from("trip_activities").delete().eq("id", params.activityId);
     if (error) throw new Error(error.message);
 
    await safeInsertAudit(supabase, {
      trip_id: String(row.trip_id),
      entity_type: "activity",
      entity_id: String(row.id),
      action: "delete",
      summary: `Eliminó plan: ${String((row as any).title || "").trim() || "Sin título"}`,
      diff: { before: row },
      actor_user_id: actor?.user?.id ?? null,
      actor_email: actor?.user?.email ?? null,
    });

     return NextResponse.json({ ok: true });
   } catch (error) {
     return NextResponse.json(
       { error: error instanceof Error ? error.message : "No se pudo borrar la actividad." },
       { status: 500 }
     );
   }
 }
 
