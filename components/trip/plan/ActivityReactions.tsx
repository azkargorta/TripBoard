"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageCircle, ThumbsUp, ThumbsDown, HelpCircle, X, Send, Loader2 } from "lucide-react";

type Reaction = {
  id: string;
  user_id: string;
  display_name: string;
  reaction: "join" | "skip" | "maybe";
  comment: string | null;
};

const REACTIONS = [
  { key: "join" as const, label: "Me apunto", icon: "✅", color: "bg-emerald-50 border-emerald-200 text-emerald-800" },
  { key: "skip" as const, label: "No puedo", icon: "❌", color: "bg-red-50 border-red-200 text-red-700" },
  { key: "maybe" as const, label: "Quizás", icon: "🤔", color: "bg-amber-50 border-amber-200 text-amber-800" },
];

export function ActivityReactions({
  tripId,
  activityId,
  currentUserId,
  displayName,
}: {
  tripId: string;
  activityId: string;
  currentUserId: string | null;
  displayName: string;
}) {
  const [open, setOpen] = useState(false);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [comment, setComment] = useState("");
  const [tableReady, setTableReady] = useState<boolean | null>(null);

  const myReaction = reactions.find((r) => r.user_id === currentUserId);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/trip-activity-reactions?tripId=${encodeURIComponent(tripId)}&activityId=${encodeURIComponent(activityId)}`);
      const data = await res.json();
      setReactions(Array.isArray(data.reactions) ? data.reactions : []);
      setTableReady(data.tableReady !== false);
    } finally {
      setLoading(false);
    }
  }, [tripId, activityId]);

  useEffect(() => { if (open) void load(); }, [open, load]);

  async function vote(reaction: "join" | "skip" | "maybe") {
    if (!currentUserId) return;
    setSaving(true);
    try {
      await fetch("/api/trip-activity-reactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, activityId, reaction, comment: comment.trim() || null, displayName }),
      });
      await load();
      setComment("");
    } finally {
      setSaving(false);
    }
  }

  async function removeVote() {
    if (!currentUserId) return;
    setSaving(true);
    try {
      await fetch(`/api/trip-activity-reactions?tripId=${encodeURIComponent(tripId)}&activityId=${encodeURIComponent(activityId)}`, { method: "DELETE" });
      await load();
    } finally {
      setSaving(false);
    }
  }

  // Summary chips (shown without opening)
  const counts = { join: 0, skip: 0, maybe: 0 };
  for (const r of reactions) counts[r.reaction] = (counts[r.reaction] || 0) + 1;
  const total = reactions.length;

  return (
    <div className="mt-2">
      {/* Toggle button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors"
      >
        <MessageCircle className="w-3.5 h-3.5" />
        {total > 0 ? (
          <span>
            {counts.join > 0 && `✅${counts.join} `}
            {counts.maybe > 0 && `🤔${counts.maybe} `}
            {counts.skip > 0 && `❌${counts.skip}`}
          </span>
        ) : (
          <span>¿Te apuntas?</span>
        )}
      </button>

      {open && (
        <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          {tableReady === false && (
            <p className="text-xs text-amber-600 font-semibold">
              ⚠️ Crea la tabla <code>trip_activity_reactions</code> en Supabase para activar esta función.
            </p>
          )}

          {loading ? (
            <div className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="w-3.5 h-3.5 animate-spin" />Cargando…</div>
          ) : (
            <>
              {/* Vote buttons */}
              {currentUserId && (
                <div className="space-y-2">
                  <p className="text-xs font-bold text-slate-500">Tu respuesta</p>
                  <div className="flex flex-wrap gap-2">
                    {REACTIONS.map((r) => (
                      <button
                        key={r.key}
                        type="button"
                        disabled={saving}
                        onClick={() => myReaction?.reaction === r.key ? removeVote() : vote(r.key)}
                        className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition ${myReaction?.reaction === r.key ? r.color + " ring-2 ring-offset-1 ring-current" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                      >
                        {r.icon} {r.label}
                        {myReaction?.reaction === r.key && <X className="w-3 h-3 ml-0.5" />}
                      </button>
                    ))}
                  </div>
                  {/* Comment input */}
                  <div className="flex gap-2">
                    <input
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && myReaction) { e.preventDefault(); void vote(myReaction.reaction); } }}
                      placeholder="Añade un comentario (opcional)"
                      className="flex-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs outline-none focus:border-violet-300"
                    />
                    {myReaction && (
                      <button type="button" disabled={saving || !comment.trim()} onClick={() => vote(myReaction.reaction)} className="rounded-xl bg-violet-600 px-3 py-1.5 text-white disabled:opacity-40">
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Responses list */}
              {reactions.length > 0 && (
                <div className="space-y-1.5 pt-1 border-t border-slate-100">
                  <p className="text-xs font-bold text-slate-400">Respuestas del grupo</p>
                  {reactions.map((r) => {
                    const meta = REACTIONS.find((x) => x.key === r.reaction)!;
                    return (
                      <div key={r.id} className="flex items-start gap-2 text-xs">
                        <span className="shrink-0 mt-0.5">{meta.icon}</span>
                        <span className="font-semibold text-slate-700">{r.display_name}</span>
                        {r.comment && <span className="text-slate-400">— {r.comment}</span>}
                      </div>
                    );
                  })}
                </div>
              )}

              {reactions.length === 0 && (
                <p className="text-xs text-slate-400">Nadie ha respondido aún. Sé el primero.</p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
