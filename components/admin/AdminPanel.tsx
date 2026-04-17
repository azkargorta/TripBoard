"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Overview = {
  monthKey: string;
  counts: { profiles: number; trips: number; pageViewsLast7Days: number };
  aiThisMonth: { usersWithUsage: number; requestsTotal: number; estimatedCostEurSum: number };
};

type VisitsPayload = {
  days: number;
  totalViews: number;
  series: { date: string; count: number }[];
  topPaths: { path: string; count: number }[];
  topUsers: { userId: string; label: string; count: number }[];
  recent: { id: string; path: string; created_at: string; user_label: string }[];
};

type AiRow = {
  user_id: string;
  user_label: string;
  month_key: string;
  provider: string;
  model: string | null;
  requests_count: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_eur: number;
  last_request_at: string | null;
};

function monthInputDefault() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export default function AdminPanel() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [visits, setVisits] = useState<VisitsPayload | null>(null);
  const [aiMonth, setAiMonth] = useState(monthInputDefault());
  const [aiRows, setAiRows] = useState<AiRow[]>([]);
  const [visitDays, setVisitDays] = useState(30);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const [o, v, a] = await Promise.all([
        fetch("/api/admin/overview", { credentials: "include" }).then((r) => r.json()),
        fetch(`/api/admin/visits?days=${visitDays}`, { credentials: "include" }).then((r) => r.json()),
        fetch(`/api/admin/ai-usage?month=${encodeURIComponent(aiMonth)}`, { credentials: "include" }).then((r) => r.json()),
      ]);
      if (o.error) throw new Error(o.error);
      if (v.error) throw new Error(v.error);
      if (a.error) throw new Error(a.error);
      setOverview(o);
      setVisits(v);
      setAiRows(Array.isArray(a.rows) ? a.rows : []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [aiMonth, visitDays]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="page-shell space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Administración</p>
          <h1 className="mt-1 text-3xl font-extrabold text-slate-950">Panel de administrador</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Uso del asistente personal por usuario y mes, visitas a páginas (usuarios logueados) y métricas básicas de la plataforma.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard"
            className="inline-flex min-h-[44px] items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Volver al dashboard
          </Link>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex min-h-[44px] items-center justify-center rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Actualizar
          </button>
        </div>
      </div>

      {err ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{err}</div>
      ) : null}

      {loading && !overview ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-slate-600">Cargando…</div>
      ) : overview ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Perfiles</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{overview.counts.profiles}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Viajes</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{overview.counts.trips}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Visitas (7 días)</p>
            <p className="mt-2 text-3xl font-bold text-slate-950">{overview.counts.pageViewsLast7Days}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Asistente personal este mes ({overview.monthKey})
            </p>
            <p className="mt-2 text-lg font-bold text-slate-950">
              ~{overview.aiThisMonth.estimatedCostEurSum.toFixed(4)} €
            </p>
            <p className="mt-1 text-xs text-slate-600">
              {overview.aiThisMonth.requestsTotal} peticiones · {overview.aiThisMonth.usersWithUsage} usuarios
            </p>
          </div>
        </section>
      ) : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-950">Gasto del asistente personal por usuario (mes)</h2>
            <p className="mt-1 text-sm text-slate-600">Coste estimado a partir de tokens (Gemini Flash).</p>
          </div>
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
            Mes (UTC)
            <input
              type="month"
              value={aiMonth}
              onChange={(e) => setAiMonth(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
            />
          </label>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-3">Usuario</th>
                <th className="py-2 pr-3">Modelo</th>
                <th className="py-2 pr-3">Peticiones</th>
                <th className="py-2 pr-3">Tokens in/out</th>
                <th className="py-2 pr-3">~€</th>
                <th className="py-2">Última</th>
              </tr>
            </thead>
            <tbody>
              {aiRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-slate-500">
                    Sin datos del asistente personal para este mes.
                  </td>
                </tr>
              ) : (
                aiRows.map((r) => (
                  <tr key={`${r.user_id}-${r.month_key}-${r.provider}`} className="border-b border-slate-100">
                    <td className="py-2 pr-3 font-medium text-slate-900">{r.user_label}</td>
                    <td className="py-2 pr-3 text-slate-700">{r.model ?? "—"}</td>
                    <td className="py-2 pr-3">{r.requests_count}</td>
                    <td className="py-2 pr-3 text-slate-600">
                      {Number(r.input_tokens).toLocaleString("es-ES")} / {Number(r.output_tokens).toLocaleString("es-ES")}
                    </td>
                    <td className="py-2 pr-3 font-semibold">{Number(r.estimated_cost_eur).toFixed(4)}</td>
                    <td className="py-2 text-slate-600">
                      {r.last_request_at ? new Date(r.last_request_at).toLocaleString("es-ES") : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-950">Visitas (usuarios logueados)</h2>
            <p className="mt-1 text-sm text-slate-600">
              Solo se registran rutas cuando hay sesión. Ajusta el periodo para ver tendencias.
            </p>
          </div>
          <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
            Días
            <select
              value={visitDays}
              onChange={(e) => setVisitDays(Number(e.target.value))}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900"
            >
              <option value={7}>7</option>
              <option value={14}>14</option>
              <option value={30}>30</option>
              <option value={60}>60</option>
              <option value={90}>90</option>
            </select>
          </label>
        </div>

        {visits ? (
          <div className="mt-6 space-y-6">
            <p className="text-sm text-slate-700">
              <span className="font-semibold">{visits.totalViews}</span> vistas en los últimos {visits.days} días (muestra
              máx. 5000).
            </p>
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Rutas más visitadas</h3>
                <ul className="mt-2 space-y-1 text-sm text-slate-700">
                  {visits.topPaths.map((p) => (
                    <li key={p.path} className="flex justify-between gap-2 border-b border-slate-100 py-1">
                      <span className="truncate font-mono text-xs">{p.path}</span>
                      <span className="shrink-0 font-semibold">{p.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">Usuarios más activos</h3>
                <ul className="mt-2 space-y-1 text-sm text-slate-700">
                  {visits.topUsers.map((u) => (
                    <li key={u.userId} className="flex justify-between gap-2 border-b border-slate-100 py-1">
                      <span className="truncate">{u.label}</span>
                      <span className="shrink-0 font-semibold">{u.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800">Últimas visitas</h3>
              <div className="mt-2 max-h-72 overflow-y-auto rounded-xl border border-slate-100">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr className="text-slate-500">
                      <th className="p-2">Cuándo</th>
                      <th className="p-2">Usuario</th>
                      <th className="p-2">Ruta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visits.recent.map((r) => (
                      <tr key={r.id} className="border-t border-slate-100">
                        <td className="p-2 text-slate-600">{new Date(r.created_at).toLocaleString("es-ES")}</td>
                        <td className="p-2">{r.user_label}</td>
                        <td className="p-2 font-mono">{r.path}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <p className="font-semibold">Cómo darte permisos de administrador</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Ejecuta en Supabase el SQL de <code className="rounded bg-white/80 px-1">docs/tripboard_platform_admin.sql</code>.</li>
          <li>
            Inserta tu <code className="rounded bg-white/80 px-1">user_id</code> en{" "}
            <code className="rounded bg-white/80 px-1">platform_admins</code>, o define{" "}
            <code className="rounded bg-white/80 px-1">TRIPBOARD_ADMIN_EMAILS</code> en el servidor.
          </li>
        </ol>
      </section>
    </main>
  );
}
