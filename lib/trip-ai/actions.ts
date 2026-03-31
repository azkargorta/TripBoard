import { createServerSupabase } from "@/lib/trip-ai/serverSupabase";

export type ParsedAction =
  | { type: "none" }
  | { type: "create_activity"; title: string; date?: string; location_name?: string; notes?: string }
  | { type: "mark_settlement_paid"; debtor_name?: string; creditor_name?: string }
  | { type: "optimizer_summary" };

function normalize(input: string) {
  return input.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function detectAction(question: string, mode: string): ParsedAction {
  const q = normalize(question);

  if (mode === "optimizer" || q.includes("optimiza") || q.includes("optimizar viaje")) {
    return { type: "optimizer_summary" };
  }

  if (q.includes("anade actividad") || q.includes("añade actividad") || q.includes("crear actividad")) {
    const titleMatch =
      question.match(/actividad[:\s]+(.+)$/i) ||
      question.match(/(?:anade|añade|crear) actividad\s+(.+)$/i);
    const dateMatch = question.match(/(20\d{2}-\d{2}-\d{2})/);
    return {
      type: "create_activity",
      title: titleMatch?.[1]?.trim() || "Actividad creada por IA",
      date: dateMatch?.[1],
    };
  }

  if (q.includes("marcar pagado") || q.includes("marca como pagado") || q.includes("dar por pagado")) {
    return { type: "mark_settlement_paid" };
  }

  return { type: "none" };
}

async function createActivity(tripId: string, action: Extract<ParsedAction, { type: "create_activity" }>) {
  const supabase = createServerSupabase();
  const response = await supabase
    .from("trip_activities")
    .insert({
      trip_id: tripId,
      title: action.title,
      activity_date: action.date || null,
      location_name: action.location_name || null,
      notes: action.notes || "Creada desde Chat IA",
      activity_type: "general",
    })
    .select("*")
    .single();

  if (response.error) {
    throw new Error(`No se pudo crear la actividad. ${response.error.message}`);
  }

  return `He creado la actividad "${action.title}"${action.date ? ` para el día ${action.date}` : ""}.`;
}

async function markSettlementPaid(tripId: string) {
  const supabase = createServerSupabase();
  const pending = await supabase
    .from("trip_expense_settlements")
    .select("*")
    .eq("trip_id", tripId)
    .neq("status", "paid")
    .order("created_at", { ascending: true })
    .limit(1);

  if (pending.error) {
    throw new Error(pending.error.message);
  }

  const first = pending.data?.[0];
  if (!first) {
    return "No he encontrado balances pendientes de pago para marcar.";
  }

  const update = await supabase
    .from("trip_expense_settlements")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
    })
    .eq("id", first.id);

  if (update.error) {
    throw new Error(update.error.message);
  }

  return `He marcado como pagado el balance pendiente de ${first.debtor_name} a ${first.creditor_name} por ${first.amount} ${first.currency}.`;
}

export async function executeAction(tripId: string, action: ParsedAction) {
  if (action.type === "create_activity") {
    return await createActivity(tripId, action);
  }

  if (action.type === "mark_settlement_paid") {
    return await markSettlementPaid(tripId);
  }

  return null;
}
