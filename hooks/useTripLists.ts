"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type TripList = {
  id: string;
  trip_id: string;
  title: string;
  visibility: "private" | "shared";
  editable_by_all: boolean;
  owner_user_id: string;
  created_at: string;
  updated_at: string;
};

export type TripListItem = {
  id: string;
  trip_id: string;
  list_id: string;
  text: string;
  qty: number | null;
  note: string | null;
  is_done: boolean;
  position: number;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type ListsPayload = {
  lists: TripList[];
  countsByList: Record<string, { total: number; done: number }>;
  access?: { role: "owner" | "editor" | "viewer"; canManageResources: boolean };
};

function parseJson(text: string) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

export function useTripLists(tripId: string) {
  const [lists, setLists] = useState<TripList[]>([]);
  const [countsByList, setCountsByList] = useState<Record<string, { total: number; done: number }>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [access, setAccess] = useState<ListsPayload["access"] | null>(null);

  const apiRequest = useCallback(async <T,>(input: RequestInfo, init: RequestInit, label: string): Promise<T> => {
    const resp = await fetch(input, init);
    const text = await resp.text();
    const payload = parseJson(text) ?? { error: text || "Respuesta no JSON." };
    if (!resp.ok) throw new Error(payload?.error || `Error ${resp.status} (${label})`);
    if (payload?.error) throw new Error(payload.error);
    return payload as T;
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const payload = await apiRequest<ListsPayload>(
        `/api/trip-lists?tripId=${encodeURIComponent(tripId)}`,
        { method: "GET" },
        "cargar listas"
      );
      setLists(Array.isArray(payload.lists) ? payload.lists : []);
      setCountsByList(payload.countsByList || {});
      setAccess(payload.access || null);
    } catch (err) {
      setLists([]);
      setCountsByList({});
      setAccess(null);
      setError(err instanceof Error ? err.message : "No se pudieron cargar las listas");
    } finally {
      setLoading(false);
    }
  }, [apiRequest, tripId]);

  useEffect(() => {
    load();
  }, [load]);

  const createList = useCallback(
    async (input: { title: string; visibility: "private" | "shared"; editable_by_all: boolean }) => {
      setSaving(true);
      setError(null);
      try {
        const payload = await apiRequest<{ list: TripList }>(
          "/api/trip-lists",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tripId,
              title: input.title,
              visibility: input.visibility,
              editable_by_all: input.visibility === "shared" ? input.editable_by_all : false,
            }),
          },
          "crear lista"
        );
        await load();
        return payload?.list ?? null;
      } finally {
        setSaving(false);
      }
    },
    [apiRequest, load, tripId]
  );

  const updateList = useCallback(
    async (listId: string, patch: Partial<Pick<TripList, "title" | "visibility" | "editable_by_all">>) => {
      setSaving(true);
      setError(null);
      try {
        await apiRequest(
          `/api/trip-lists/${encodeURIComponent(listId)}`,
          { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) },
          "actualizar lista"
        );
        await load();
      } finally {
        setSaving(false);
      }
    },
    [apiRequest, load]
  );

  const deleteList = useCallback(
    async (listId: string) => {
      const ok = window.confirm("¿Seguro que quieres eliminar esta lista?");
      if (!ok) return;
      setSaving(true);
      setError(null);
      try {
        await apiRequest(`/api/trip-lists/${encodeURIComponent(listId)}`, { method: "DELETE" }, "eliminar lista");
        await load();
      } finally {
        setSaving(false);
      }
    },
    [apiRequest, load]
  );

  const sortedLists = useMemo(() => [...lists].sort((a, b) => b.updated_at.localeCompare(a.updated_at)), [lists]);

  return {
    lists: sortedLists,
    countsByList,
    access,
    loading,
    saving,
    error,
    reload: load,
    createList,
    updateList,
    deleteList,
  };
}

export function useTripListItems(tripId: string, listId: string | null) {
  const [items, setItems] = useState<TripListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiRequest = useCallback(async <T,>(input: RequestInfo, init: RequestInit, label: string): Promise<T> => {
    const resp = await fetch(input, init);
    const text = await resp.text();
    const payload = parseJson(text) ?? { error: text || "Respuesta no JSON." };
    if (!resp.ok) throw new Error(payload?.error || `Error ${resp.status} (${label})`);
    if (payload?.error) throw new Error(payload.error);
    return payload as T;
  }, []);

  const load = useCallback(async () => {
    if (!listId) {
      setItems([]);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const payload = await apiRequest<{ items: TripListItem[] }>(
        `/api/trip-lists/${encodeURIComponent(listId)}/items?tripId=${encodeURIComponent(tripId)}`,
        { method: "GET" },
        "cargar items"
      );
      setItems(Array.isArray(payload.items) ? payload.items : []);
    } catch (err) {
      setItems([]);
      setError(err instanceof Error ? err.message : "No se pudieron cargar los items");
    } finally {
      setLoading(false);
    }
  }, [apiRequest, listId, tripId]);

  useEffect(() => {
    load();
  }, [load]);

  const createItem = useCallback(
    async (input: { text: string; qty: number | null; note: string | null }) => {
      if (!listId) return;
      setSaving(true);
      setError(null);
      try {
        await apiRequest(
          `/api/trip-lists/${encodeURIComponent(listId)}/items`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tripId, text: input.text, qty: input.qty, note: input.note }),
          },
          "crear item"
        );
        await load();
      } finally {
        setSaving(false);
      }
    },
    [apiRequest, listId, load, tripId]
  );

  const updateItem = useCallback(
    async (itemId: string, patch: Partial<Pick<TripListItem, "text" | "qty" | "note" | "is_done" | "position">>) => {
      setSaving(true);
      setError(null);
      try {
        await apiRequest(
          `/api/trip-list-items/${encodeURIComponent(itemId)}`,
          { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) },
          "actualizar item"
        );
        await load();
      } finally {
        setSaving(false);
      }
    },
    [apiRequest, load]
  );

  const deleteItem = useCallback(
    async (itemId: string) => {
      const ok = window.confirm("¿Seguro que quieres eliminar este item?");
      if (!ok) return;
      setSaving(true);
      setError(null);
      try {
        await apiRequest(`/api/trip-list-items/${encodeURIComponent(itemId)}`, { method: "DELETE" }, "eliminar item");
        await load();
      } finally {
        setSaving(false);
      }
    },
    [apiRequest, load]
  );

  const sortedItems = useMemo(() => [...items].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)), [items]);

  return { items: sortedItems, loading, saving, error, reload: load, createItem, updateItem, deleteItem };
}

