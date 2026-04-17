import { createServerSupabase } from "@/lib/trip-ai/serverSupabase";

export type ChatMode = "general" | "planning" | "expenses" | "optimizer" | "actions" | "day_planner";

export async function listConversations(tripId: string) {
  const supabase = createServerSupabase();
  const response = await supabase
    .from("trip_ai_conversations")
    .select("*")
    .eq("trip_id", tripId)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (response.error) throw new Error(response.error.message);
  return response.data || [];
}

export async function createConversation(tripId: string, mode: ChatMode, title?: string) {
  const supabase = createServerSupabase();
  const response = await supabase
    .from("trip_ai_conversations")
    .insert({
      trip_id: tripId,
      mode,
      title: title?.trim() || "Nueva conversación",
    })
    .select("*")
    .single();

  if (response.error) throw new Error(response.error.message);
  return response.data;
}

export async function getConversation(conversationId: string) {
  const supabase = createServerSupabase();
  const response = await supabase
    .from("trip_ai_conversations")
    .select("*")
    .eq("id", conversationId)
    .single();

  if (response.error) throw new Error(response.error.message);
  return response.data;
}

export async function listMessages(conversationId: string) {
  const supabase = createServerSupabase();
  const response = await supabase
    .from("trip_ai_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (response.error) throw new Error(response.error.message);
  return response.data || [];
}

export async function appendMessage(params: {
  conversationId: string;
  tripId: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata?: Record<string, unknown>;
  /** Si se indica, actualiza el modo de la conversación (p. ej. planning tras detectar itinerario en modo automático). */
  conversationMode?: ChatMode;
}) {
  const supabase = createServerSupabase();
  const response = await supabase
    .from("trip_ai_messages")
    .insert({
      conversation_id: params.conversationId,
      trip_id: params.tripId,
      role: params.role,
      content: params.content,
      metadata: params.metadata || {},
    })
    .select("*")
    .single();

  if (response.error) throw new Error(response.error.message);

  const convoPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (params.role === "user" && params.content.trim()) {
    convoPatch.title = params.content.trim().slice(0, 60);
  }
  if (params.conversationMode) {
    convoPatch.mode = params.conversationMode;
  }

  await supabase.from("trip_ai_conversations").update(convoPatch).eq("id", params.conversationId);

  return response.data;
}
