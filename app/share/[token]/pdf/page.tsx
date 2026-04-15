import { notFound } from "next/navigation";
import { headers } from "next/headers";
import PrintOnLoad from "./PrintOnLoad";

type Props = { params: { token: string } };

type Trip = {
  id: string;
  name: string | null;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
};

type Activity = {
  id: string;
  title: string | null;
  activity_date: string | null;
  activity_time: string | null;
  place_name: string | null;
  address: string | null;
  activity_kind: string | null;
  activity_type: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "Sin fecha";
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function groupByDay(activities: Activity[]) {
  const map = new Map<string, Activity[]>();
  for (const a of activities) {
    const d = a.activity_date || "Sin fecha";
    const arr = map.get(d) || [];
    arr.push(a);
    map.set(d, arr);
  }
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
}

export default async function SharePdfPage({ params }: Props) {
  const token = params.token;
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "";
  const proto = h.get("x-forwarded-proto") || "https";
  const origin = host ? `${proto}://${host}` : "";

  const res = await fetch(`${origin}/api/trip-shares/${token}`, { cache: "no-store" }).catch(() => null);
  if (!res) notFound();
  if (res.status === 404) notFound();

  const payload = await res.json().catch(() => null);
  if (!payload?.trip) notFound();

  const trip = payload.trip as Trip;
  const activities = (payload.activities || []) as Activity[];
  const days = groupByDay(activities);

  return (
    <main className="bg-white text-slate-950">
      <PrintOnLoad />
      <style>{`
        @page { size: A4; margin: 14mm; }
        @media print {
          .no-print { display: none !important; }
          a { color: inherit; text-decoration: none; }
        }
      `}</style>

      <div className="no-print border-b border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        Se abrirá el diálogo de impresión. Elige “Guardar como PDF”.
      </div>

      <div className="mx-auto max-w-[780px] p-6">
        <div className="mb-6">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Itinerario</div>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight">{trip.name || "Viaje"}</h1>
          <div className="mt-2 text-sm text-slate-600">
            {(trip.destination || "Destino pendiente") + " · " + `${formatDate(trip.start_date)} — ${formatDate(trip.end_date)}`}
          </div>
        </div>

        {days.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 p-4 text-sm text-slate-600">
            Este viaje todavía no tiene actividades en el plan.
          </div>
        ) : (
          <div className="space-y-6">
            {days.map(([day, rows]) => (
              <section key={day}>
                <h2 className="text-lg font-bold">{day === "Sin fecha" ? "Sin fecha" : formatDate(day)}</h2>
                <div className="mt-3 space-y-2">
                  {rows.map((a) => (
                    <div key={a.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold">{a.title || a.place_name || "Actividad"}</div>
                          <div className="mt-1 text-sm text-slate-600">
                            {(a.place_name || a.address || "Ubicación pendiente") +
                              (a.activity_time ? ` · ${a.activity_time.slice(0, 5)}` : "")}
                          </div>
                        </div>
                        <div className="text-xs font-semibold text-slate-600">
                          {a.activity_kind || a.activity_type || ""}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

