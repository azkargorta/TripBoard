 import { NextResponse } from "next/server";
 import { createClient } from "@/lib/supabase/server";
 import { requireTripAccess } from "@/lib/trip-access";
 import { safeInsertAudit } from "@/lib/audit";

 function calculateNights(checkInDate?: string | null, checkOutDate?: string | null) {
   if (!checkInDate || !checkOutDate) return null;
   const start = new Date(checkInDate);
   const end = new Date(checkOutDate);
   const diffMs = end.getTime() - start.getTime();
   if (Number.isNaN(diffMs) || diffMs < 0) return null;
   return Math.round(diffMs / (1000 * 60 * 60 * 24));
 }

 function isLodgingActivityRow(row: { activity_type?: string | null; activity_kind?: string | null }) {
   const t = String(row.activity_type || "").toLowerCase();
   const k = String(row.activity_kind || "").toLowerCase();
   return t === "lodging" || k === "lodging" || k === "hotel";
 }

 function lodgingReservationNameFromActivity(row: {
   title?: string | null;
   place_name?: string | null;
 }) {
   const place = typeof row.place_name === "string" ? row.place_name.trim() : "";
   if (place) return place;
   const title = typeof row.title === "string" ? row.title.trim() : "";
   return title.replace(/^Check-in\s*·\s*/i, "").trim() || title;
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

    const linkedId =
      typeof (data as any)?.linked_reservation_id === "string" ? String((data as any).linked_reservation_id) : null;
    if (linkedId && isLodgingActivityRow(data as any)) {
      if (!access.can_manage_resources) {
        return NextResponse.json({
          activity: data,
          warning:
            "La actividad se guardó en el plan, pero no tienes permiso para actualizar Docs (reservas). Pide acceso de gestión de recursos o edita el alojamiento en Docs.",
        });
      }

      const { data: resRow, error: resErr } = await supabase
        .from("trip_reservations")
        .select("id, check_out_date, check_out_time")
        .eq("id", linkedId)
        .maybeSingle();
      if (resErr) throw new Error(resErr.message);

      const checkOutDate = typeof resRow?.check_out_date === "string" ? resRow.check_out_date : null;
      const checkOutTime = typeof resRow?.check_out_time === "string" ? resRow.check_out_time : null;

      const resPatch: Record<string, unknown> = {
        reservation_name: lodgingReservationNameFromActivity(data as any),
        notes: (data as any).description ?? null,
        check_in_date: (data as any).activity_date ?? null,
        check_in_time: (data as any).activity_time ?? null,
        check_out_date: checkOutDate,
        check_out_time: checkOutTime,
        address: (data as any).address ?? null,
        latitude: typeof (data as any).latitude === "number" ? (data as any).latitude : null,
        longitude: typeof (data as any).longitude === "number" ? (data as any).longitude : null,
        nights: calculateNights((data as any).activity_date ?? null, checkOutDate),
      };

      const { error: updResErr } = await supabase.from("trip_reservations").update(resPatch).eq("id", linkedId);
      if (updResErr) throw new Error(updResErr.message);
    }

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

    const linkedReservationId =
      typeof (row as any)?.linked_reservation_id === "string" ? String((row as any).linked_reservation_id) : null;

    if (linkedReservationId && isLodgingActivityRow(row as any)) {
      if (!access.can_manage_resources) {
        return NextResponse.json(
          {
            error:
              "Este alojamiento está vinculado a Docs (reserva). No tienes permiso para eliminarlo desde el plan; pide acceso de gestión de recursos o bórralo en Docs.",
          },
          { status: 403 }
        );
      }

      const { error: delActErr } = await supabase.from("trip_activities").delete().eq("linked_reservation_id", linkedReservationId);
      if (delActErr) throw new Error(delActErr.message);

      const { error: delResErr } = await supabase.from("trip_reservations").delete().eq("id", linkedReservationId);
      if (delResErr) throw new Error(delResErr.message);
    } else {
      const { error } = await supabase.from("trip_activities").delete().eq("id", params.activityId);
      if (error) throw new Error(error.message);
    }

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
 
