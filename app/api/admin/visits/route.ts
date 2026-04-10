import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { isPlatformAdmin } from "@/lib/platform-admin";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "No autenticado." }, { status: 401 });
    }
    if (!(await isPlatformAdmin(user.id, user.email))) {
      return NextResponse.json({ error: "Sin permisos de administrador." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const days = Math.min(90, Math.max(1, Number(searchParams.get("days")) || 30));

    const admin = createSupabaseAdmin();
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - days);
    const sinceIso = since.toISOString();

    const { data: views, error: vErr } = await admin
      .from("site_page_views")
      .select("id, user_id, path, created_at")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(5000);
    if (vErr) throw vErr;

    const userIds = [...new Set((views ?? []).map((v: { user_id: string }) => v.user_id))];
    let labelById: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await admin.from("profiles").select("id, email, username, full_name").in("id", userIds);
      for (const p of profiles ?? []) {
        const row = p as { id: string; email: string | null; username: string | null; full_name: string | null };
        labelById[row.id] = row.email || row.username || row.full_name || row.id;
      }
    }

    const byDay = new Map<string, number>();
    const byPath = new Map<string, number>();
    const byUser = new Map<string, number>();

    for (const row of views ?? []) {
      const r = row as { user_id: string; path: string; created_at: string };
      const day = r.created_at.slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
      byPath.set(r.path, (byPath.get(r.path) ?? 0) + 1);
      byUser.set(r.user_id, (byUser.get(r.user_id) ?? 0) + 1);
    }

    const topPaths = [...byPath.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25)
      .map(([path, count]) => ({ path, count }));

    const topUsers = [...byUser.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25)
      .map(([userId, count]) => ({ userId, label: labelById[userId] ?? userId, count }));

    const series = [...byDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({ date, count }));

    const recent = (views ?? []).slice(0, 80).map((r: any) => ({
      id: r.id,
      path: r.path,
      created_at: r.created_at,
      user_label: labelById[r.user_id] ?? r.user_id,
    }));

    return NextResponse.json({
      days,
      totalViews: (views ?? []).length,
      series,
      topPaths,
      topUsers,
      recent,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Error al cargar visitas." },
      { status: 500 }
    );
  }
}
