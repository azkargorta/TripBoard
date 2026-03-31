import { createServerSupabase } from "@/lib/trip-ai/serverSupabase";

type SafeRow = Record<string, unknown>;

async function readMaybe(
  supabase: ReturnType<typeof createServerSupabase>,
  table: string,
  tripId: string
) {
  try {
    const response = await supabase.from(table).select("*").eq("trip_id", tripId).limit(100);
    if (response.error) return [];
    return (response.data || []) as SafeRow[];
  } catch {
    return [];
  }
}

function formatValue(value: unknown) {
  if (value == null) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function rowsToBullets(title: string, rows: SafeRow[], fields: string[]) {
  if (!rows.length) return `${title}: sin datos.`;

  const lines = rows.slice(0, 30).map((row, index) => {
    const parts = fields
      .map((field) => {
        const value = formatValue(row[field]);
        return value ? `${field}: ${value}` : "";
      })
      .filter(Boolean);

    return `- ${index + 1}. ${parts.join(" | ")}`;
  });

  return `${title}:\n${lines.join("\n")}`;
}

function pickTripSummary(trip: SafeRow | null) {
  if (!trip) return "Viaje: no se ha podido leer la ficha principal.";

  const name = typeof trip.name === "string" ? trip.name : "Viaje sin nombre";
  const destination = typeof trip.destination === "string" && trip.destination.trim() ? trip.destination : "Sin destino definido";
  const startDate = typeof trip.start_date === "string" && trip.start_date.trim() ? trip.start_date : "Sin fecha de inicio";
  const endDate = typeof trip.end_date === "string" && trip.end_date.trim() ? trip.end_date : "Sin fecha de fin";
  const currency = typeof trip.base_currency === "string" && trip.base_currency.trim() ? trip.base_currency : "EUR";

  return [
    `Viaje: ${name}`,
    `Destino: ${destination}`,
    `Fechas: ${startDate} → ${endDate}`,
    `Moneda base: ${currency}`,
  ].join(" | ");
}

function buildQuickSummary(data: {
  participants: SafeRow[];
  reservations: SafeRow[];
  resources: SafeRow[];
  expenses: SafeRow[];
  settlements: SafeRow[];
  routes: SafeRow[];
  activities: SafeRow[];
}) {
  const totalExpenses = data.expenses.reduce((acc, item) => {
    const amount = Number(item.amount);
    return acc + (Number.isFinite(amount) ? amount : 0);
  }, 0);

  return [
    `Participantes: ${data.participants.length}`,
    `Reservas: ${data.reservations.length}`,
    `Recursos: ${data.resources.length}`,
    `Gastos: ${data.expenses.length}`,
    `Balance pendientes: ${data.settlements.filter((x) => x.status !== "paid").length}`,
    `Rutas: ${data.routes.length}`,
    `Actividades: ${data.activities.length}`,
    `Suma gastos registrada: ${totalExpenses.toFixed(2)}`,
  ].join(" | ");
}

export async function buildTripContext(tripId: string) {
  const supabase = createServerSupabase();

  const tripResponse = await supabase.from("trips").select("*").eq("id", tripId).maybeSingle();
  const trip = (tripResponse.data || null) as SafeRow | null;

  const [participants, reservations, resources, expenses, settlements, routes, activities] =
    await Promise.all([
      readMaybe(supabase, "trip_participants", tripId),
      readMaybe(supabase, "trip_reservations", tripId),
      readMaybe(supabase, "trip_resources", tripId),
      readMaybe(supabase, "trip_expenses", tripId),
      readMaybe(supabase, "trip_expense_settlements", tripId),
      readMaybe(supabase, "trip_routes", tripId),
      readMaybe(supabase, "trip_activities", tripId),
    ]);

  const sections = [
    pickTripSummary(trip),
    buildQuickSummary({ participants, reservations, resources, expenses, settlements, routes, activities }),
    rowsToBullets("Participantes", participants, ["name", "email", "role", "status"]),
    rowsToBullets("Reservas", reservations, ["title", "reservation_type", "provider", "start_date", "end_date", "location_name", "address", "price_amount", "currency", "notes"]),
    rowsToBullets("Recursos", resources, ["title", "category", "form_type", "location_name", "start_date", "end_date", "notes", "metadata"]),
    rowsToBullets("Gastos", expenses, ["title", "category", "amount", "currency", "expense_date", "payer_name", "paid_by_names", "owed_by_names", "notes"]),
    rowsToBullets("Balance de gastos", settlements, ["debtor_name", "creditor_name", "amount", "currency", "status", "notes"]),
    rowsToBullets("Rutas", routes, ["route_day", "title", "origin_name", "destination_name", "departure_time", "travel_mode", "notes"]),
    rowsToBullets("Actividades", activities, ["title", "activity_date", "activity_type", "location_name", "start_time", "end_time", "notes"]),
  ];

  return sections.join("\n\n").slice(0, 18000);
}
