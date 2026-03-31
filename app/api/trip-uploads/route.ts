import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export async function GET(req: NextRequest) {
  try {
    const tripId = req.nextUrl.searchParams.get("tripId");

    if (!tripId) {
      return NextResponse.json({ error: "tripId es obligatorio" }, { status: 400 });
    }

    const supabase = createSupabaseAdmin();

    const { data, error } = await supabase
      .from("trip_uploads")
      .select("*")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ uploads: data || [] });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Error interno" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const {
      tripId,
      originalName,
      storagePath,
      mimeType,
      fileSize,
    }: {
      tripId?: string;
      originalName?: string;
      storagePath?: string;
      mimeType?: string;
      fileSize?: number;
    } = body || {};

    if (!tripId || !originalName || !storagePath) {
      return NextResponse.json(
        { error: "tripId, originalName y storagePath son obligatorios" },
        { status: 400 }
      );
    }

    const supabase = createSupabaseAdmin();

    const { data, error } = await supabase
      .from("trip_uploads")
      .insert([
        {
          trip_id: tripId,
          original_name: originalName,
          storage_path: storagePath,
          mime_type: mimeType || null,
          file_size: fileSize || null,
          ai_status: "pending",
        },
      ])
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ upload: data });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Error interno" },
      { status: 500 }
    );
  }
}