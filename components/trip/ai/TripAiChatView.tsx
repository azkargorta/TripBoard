"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import TripScreenActions from "@/components/trip/common/TripScreenActions";

type ChatMode = "general" | "planning" | "expenses" | "optimizer" | "actions";

type Conversation = {
  id: string;
  title: string;
  mode: ChatMode;
  updated_at?: string;
};

type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  metadata?: Record<string, unknown>;
};

const MODE_OPTIONS: { id: ChatMode; label: string; description: string }[] = [
  { id: "general", label: "General", description: "Consultas generales del viaje" },
  { id: "planning", label: "Planificación", description: "Plan del viaje, días y visitas" },
  { id: "expenses", label: "Gastos", description: "Balances, pagos y ahorro" },
  { id: "optimizer", label: "Optimizador", description: "Mejoras automáticas del viaje" },
  { id: "actions", label: "Acciones", description: "Crear o modificar datos del viaje" },
];

const SUGGESTIONS: Record<ChatMode, string[]> = {
  general: [
    "Hazme un resumen del viaje",
    "¿Qué reservas tengo confirmadas?",
    "¿Qué documentos importantes tengo guardados?",
  ],
  planning: [
    "Dame un plan para 4 días",
    "¿Qué actividades tengo por día?",
    "Organiza un recorrido lógico con lo que ya tengo",
  ],
  expenses: [
    "¿Cuánto llevamos gastado?",
    "¿Quién debe dinero ahora mismo?",
    "¿Qué pagos siguen pendientes?",
  ],
  optimizer: [
    "Optimiza mi viaje y dime mejoras",
    "Detecta huecos y conflictos",
    "¿Qué cambiarías para aprovechar mejor el viaje?",
  ],
  actions: [
    "Añade actividad cena en Honfleur 2026-04-02",
    "Marca como pagado el siguiente balance pendiente",
    "Crea una actividad paseo por Caen 2026-04-03",
  ],
};

export default function TripAiChatView({ tripId }: { tripId: string }) {
  const [mode, setMode] = useState<ChatMode>("general");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hola. Soy tu asistente del viaje. Ya puedo recordar conversaciones, ayudarte con gastos, optimizar el viaje y ejecutar algunas acciones básicas dentro de la app.",
    },
  ]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const currentSuggestions = useMemo(() => SUGGESTIONS[mode], [mode]);

  useEffect(() => {
    void loadConversations();
  }, [tripId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function loadConversations() {
    const res = await fetch(`/api/trip-ai/conversations?tripId=${encodeURIComponent(tripId)}`);
    const data = await res.json().catch(() => null);
    if (res.ok) {
      setConversations(Array.isArray(data?.conversations) ? data.conversations : []);
    }
  }

  async function openConversation(id: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/trip-ai/conversations/${id}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "No se pudo abrir la conversación.");
      setConversationId(id);
      setMessages(data?.messages?.length ? data.messages : []);
      if (data?.conversation?.mode) setMode(data.conversation.mode);
      setInfo(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo abrir la conversación.");
    } finally {
      setLoading(false);
    }
  }

  function newConversation() {
    setConversationId(null);
    setMessages([
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          "Nueva conversación iniciada. Pregúntame lo que necesites sobre tu viaje.",
      },
    ]);
    setQuestion("");
    setInfo(null);
    setError(null);
  }

  async function sendMessage(customQuestion?: string) {
    const clean = (customQuestion ?? question).trim();
    if (!clean || loading) return;

    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: "user", content: clean },
    ]);
    setQuestion("");
    setLoading(true);
    setError(null);
    setInfo(null);

    try {
      const res = await fetch("/api/trip-ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, question: clean, mode, conversationId }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "No se pudo obtener respuesta.");

      setConversationId(data?.conversationId || conversationId);
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data?.answer || "No se pudo generar respuesta",
        },
      ]);

      if (data?.actionExecuted && data?.actionResult) {
        setInfo(String(data.actionResult));
      }

      await loadConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo obtener respuesta.");
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "He tenido un problema al responder. Revisa la configuración del chat IA.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    void sendMessage();
  }

  return (
    <main className="page-shell space-y-6">
      <section className="rounded-[28px] border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-sky-50 p-6 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
              <span>🤖</span>
              <span>Asistente IA del viaje</span>
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-slate-950 md:text-5xl">
              Chat, memoria, acciones y optimización
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600 md:text-base">
              Ya puede recordar conversaciones, ayudarte con gastos, optimizar el viaje y ejecutar
              acciones básicas dentro de la app.
            </p>
          </div>

          <div className="grid gap-3 xl:w-[360px]">
            <TripScreenActions tripId={tripId} />
            <div className="grid gap-2 rounded-2xl border border-slate-200 bg-white/80 p-4 text-sm text-slate-600 shadow-sm">
              <p><strong>Viaje:</strong> {tripId.slice(0, 8)}…</p>
              <p><strong>Conversación activa:</strong> {conversationId ? conversationId.slice(0, 8) : "Nueva"}</p>
              <p><strong>Modo actual:</strong> {MODE_OPTIONS.find((m) => m.id === mode)?.label}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-6">
          <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-slate-950">Conversaciones</h2>
              <button
                type="button"
                onClick={newConversation}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
              >
                Nueva
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {conversations.length ? conversations.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void openConversation(item.id)}
                  className={`w-full rounded-2xl border px-3 py-3 text-left text-sm transition ${
                    conversationId === item.id
                      ? "border-violet-300 bg-violet-50 text-violet-900"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <div className="font-semibold">{item.title || "Sin título"}</div>
                  <div className="mt-1 text-xs opacity-70">{item.mode}</div>
                </button>
              )) : (
                <p className="text-sm text-slate-500">Todavía no hay conversaciones guardadas.</p>
              )}
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">Modos IA</h2>
            <div className="mt-4 space-y-2">
              {MODE_OPTIONS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setMode(item.id)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                    mode === item.id
                      ? "border-violet-300 bg-violet-50"
                      : "border-slate-200 bg-slate-50 hover:bg-slate-100"
                  }`}
                >
                  <div className="font-semibold text-slate-900">{item.label}</div>
                  <div className="mt-1 text-xs text-slate-500">{item.description}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-slate-950">Preguntas rápidas</h2>
            <div className="mt-4 space-y-2">
              {currentSuggestions.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => void sendMessage(item)}
                  disabled={loading}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm text-slate-700 transition hover:bg-slate-100 disabled:opacity-60"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="rounded-[28px] border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Conversación</h2>
                <p className="mt-1 text-sm text-slate-500">
                  El asistente usa el contexto guardado del viaje y recuerda esta conversación.
                </p>
              </div>

              <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {loading ? "Pensando..." : "Listo"}
              </div>
            </div>
          </div>

          {error ? (
            <div className="mx-5 mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          {info ? (
            <div className="mx-5 mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {info}
            </div>
          ) : null}

          <div className="max-h-[560px] space-y-5 overflow-y-auto px-5 py-5">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[88%] rounded-[24px] px-4 py-3 text-sm leading-7 ${
                    message.role === "user"
                      ? "bg-slate-950 text-white"
                      : "border border-slate-200 bg-slate-50 text-slate-800"
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))}

            {loading ? (
              <div className="flex justify-start">
                <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                  Generando respuesta…
                </div>
              </div>
            ) : null}

            <div ref={bottomRef} />
          </div>

          <form onSubmit={handleSubmit} className="border-t border-slate-200 p-5">
            <div className="rounded-[24px] border border-slate-200 bg-slate-50 p-3">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                rows={4}
                placeholder="Escribe tu pregunta o acción sobre el viaje…"
                className="min-h-[120px] w-full resize-none rounded-2xl border-0 bg-transparent px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400"
              />

              <div className="flex flex-col gap-3 border-t border-slate-200 px-2 pt-3 md:flex-row md:items-center md:justify-between">
                <p className="text-xs text-slate-500">
                  Modo activo: {MODE_OPTIONS.find((m) => m.id === mode)?.label}.
                </p>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setQuestion("")}
                    disabled={loading || !question}
                    className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
                  >
                    Limpiar
                  </button>

                  <button
                    type="submit"
                    disabled={loading || !question.trim()}
                    className="rounded-xl bg-slate-950 px-5 py-2 text-sm font-semibold text-white disabled:bg-slate-300"
                  >
                    Enviar
                  </button>
                </div>
              </div>
            </div>
          </form>
        </section>
      </section>
    </main>
  );
}
