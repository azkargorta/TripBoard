"use client";

import { useCallback, useEffect, useState } from "react";

export type TripActivityKind = {
  id: string;
  trip_id: string;
  kind_key: string;
  label: string;
  emoji?: string | null;
  color?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function normalizeKey(input: unknown) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\p{L}\p{N}_-]+/gu, "");
}

export function useTripActivityKinds(tripId: string) {
  const [kinds, setKinds] = useState<TripActivityKind[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  async function apiRequest<T>(input: RequestInfo, init: RequestInit): Promise<T> {
    const resp = await fetch(input, init);
    const text = await resp.text();
    let payload: any = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { error: text || "Respuesta no JSON." };
    }
    if (!resp.ok) throw new Error(payload?.error || `Error ${resp.status}`);
    if (payload?.error) throw new Error(payload.error);
    return payload as T;
  }

  const load = useCallback(async () => {
    if (!tripId) return;
    setLoading(true);
    setError(null);
    setWarning(null);
    try {
      const payload = await apiRequest<{ kinds: TripActivityKind[]; warning?: string }>(
        `/api/trip-activity-kinds?tripId=${encodeURIComponent(tripId)}`,
        { method: "GET", cache: "no-store" as any }
      );
      setKinds(Array.isArray(payload?.kinds) ? payload.kinds : []);
      setWarning(typeof payload?.warning === "string" ? payload.warning : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar los tipos.");
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    void load();
  }, [load]);

  const createKind = useCallback(
    async (input: { kind_key: string; label: string; emoji?: string | null; color?: string | null }) => {
      setSaving(true);
      setError(null);
      try {
        const body = {
          tripId,
          kind_key: normalizeKey(input.kind_key),
          label: input.label,
          emoji: input.emoji ?? null,
          color: input.color ?? null,
        };
        await apiRequest<{ kind: TripActivityKind }>(`/api/trip-activity-kinds`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo crear el tipo.");
        throw e;
      } finally {
        setSaving(false);
      }
    },
    [load, tripId]
  );

  const updateKind = useCallback(
    async (id: string, patch: { label?: string; emoji?: string | null; color?: string | null; kind_key?: string }) => {
      setSaving(true);
      setError(null);
      try {
        await apiRequest<{ kind: TripActivityKind }>(`/api/trip-activity-kinds/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(patch.kind_key != null ? { kind_key: normalizeKey(patch.kind_key) } : {}),
            ...(patch.label != null ? { label: patch.label } : {}),
            ...(patch.emoji !== undefined ? { emoji: patch.emoji } : {}),
            ...(patch.color !== undefined ? { color: patch.color } : {}),
          }),
        });
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo actualizar el tipo.");
        throw e;
      } finally {
        setSaving(false);
      }
    },
    [load]
  );

  const deleteKind = useCallback(
    async (id: string) => {
      const ok = window.confirm("¿Seguro que quieres borrar este tipo personalizado?");
      if (!ok) return;
      setSaving(true);
      setError(null);
      try {
        await apiRequest<{ ok: true }>(`/api/trip-activity-kinds/${encodeURIComponent(id)}`, { method: "DELETE" });
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo eliminar el tipo.");
        throw e;
      } finally {
        setSaving(false);
      }
    },
    [load]
  );

  const byKey = useCallback(() => {
    const map = new Map<string, TripActivityKind>();
    for (const k of kinds) map.set(normalizeKey(k.kind_key), k);
    return map;
  }, [kinds]);

  return { kinds, loading, saving, error, warning, reload: load, createKind, updateKind, deleteKind, byKey };
}

