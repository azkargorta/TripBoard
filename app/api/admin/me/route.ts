import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/platform-admin";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ admin: false, user: null });
    }
    const admin = await isPlatformAdmin(user.id, user.email);
    return NextResponse.json({
      admin,
      user: { id: user.id, email: user.email },
    });
  } catch {
    return NextResponse.json({ admin: false, user: null });
  }
}
