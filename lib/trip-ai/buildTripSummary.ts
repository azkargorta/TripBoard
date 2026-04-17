import { createServerSupabase } from "@/lib/trip-ai/serverSupabase";

type SafeRow = Record<string, unknown>;

const MAX_LEN = 2800;

function fmt(v: unknown) {
  if (v == null) return "";
  if (typeof v === "object") return JSON.stringify(v).slice(0, 120);
  return String(v);
}

function pickTripLine(trip: SafeRow | null) {
  if (!trip) return "Viaje: (no disponible)";
  const name = typeof trip.name === "string" ? trip.name : "Sin nombre";
  const dest = typeof trip.destination === "string" && trip.destination.trim() ? trip.destination : "sin destino";
  const s = typeof trip.start_date === "string" ? trip.start_date : "—";
  const e = typeof trip.end_date === "string" ? trip.end_date : "—";
  const cur = typeof trip.base_currency === "string" ? trip.base_currency : "EUR";
  return `Viaje: ${name} | Destino: ${dest} | Fechas: ${s} → ${e} | Moneda: ${cur}`;
}

function activityLine(row: SafeRow) {
  const title = fmt(row.title);
  const d = fmt(row.activity_date);
  const t = fmt(row.activity_time);
  const place = fmt(row.place_name || row.address);
  return `- ${d} ${t} ${title}${place ? ` (${place})` : ""}`;
}

function routeLine(row: SafeRow) {
  const day = fmt(row.route_day);
  const title = fmt(row.title);
  const mode = fmt(row.travel_mode);
  return `- ${day} ${title} [${mode}]`;
}

/**
 * Resumen compacto del viaje para prompts de IA (~300–800 tokens).
 * No sustituye la lectura completa en otras herramientas; evita enviar listados enormes.
 */
export async function buildTripSummaryForAi(tripId: string): Promise<string> {
  const supabase = createServerSupabase();

  const tripRes = await supabase.from("trips").select("name, destination, start_date, end_date, base_currency").eq("id", tripId).maybeSingle();
  const trip = (tripRes.data || null) as SafeRow | null;

  const [pRes, aRes, rRes, eRes] = await Promise.all([
    supabase.from("trip_participants").select("id").eq("trip_id", tripId).neq("status", "removed").limit(80),
    supabase
      .from("trip_activities")
      .select("title, activity_date, activity_time, place_name, address, activity_kind")
      .eq("trip_id", tripId)
      .order("activity_date", { ascending: true })
      .limit(40),
    supabase
      .from("trip_routes")
      .select("route_day, title, travel_mode, departure_time")
      .eq("trip_id", tripId)
      .order("route_day", { ascending: true })
      .limit(25),
    supabase.from("trip_expenses").select("amount, currency, category").eq("trip_id", tripId).limit(200),
  ]);

  const nPart = Array.isArray(pRes.data) ? pRes.data.length : 0;
  const activities = (aRes.data || []) as SafeRow[];
  const routes = (rRes.data || []) as SafeRow[];
  const expenses = (eRes.data || []) as SafeRow[];

  const expenseSum = expenses.reduce((acc, row) => {
    const n = Number(row.amount);
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);

  const head = [
    pickTripLine(trip),
    `Resumen rápido: ${nPart} participantes | ${activities.length} actividades listadas (máx. 18 en texto) | ${routes.length} rutas (máx. 12) | ${expenses.length} gastos | suma aprox. gastos: ${expenseSum.toFixed(0)}`,
  ].join("\n");

  const actSample = activities.slice(0, 18).map(activityLine).join("\n") || "- (ninguna todavía)";
  const routeSample = routes.slice(0, 12).map(routeLine).join("\n") || "- (ninguna todavía)";

  const tail =
    activities.length > 18 || routes.length > 12
      ? "\n(Recortado: hay más actividades/rutas en la app de las que aparecen aquí.)"
      : "";

  const out = [head, "", "Actividades (muestra):", actSample, "", "Rutas (muestra):", routeSample, tail].join("\n");
  return out.length > MAX_LEN ? `${out.slice(0, MAX_LEN)}\n…` : out;
}
