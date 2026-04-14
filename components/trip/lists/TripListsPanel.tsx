"use client";

import { useEffect, useMemo, useState } from "react";
import { useTripLists, useTripListItems, type TripList } from "@/hooks/useTripLists";
import AuditLogDialog from "@/components/trip/lists/AuditLogDialog";
import AiListDraftDialog from "@/components/trip/lists/AiListDraftDialog";

function fmtCount(counts: { total: number; done: number } | undefined) {
  const total = counts?.total ?? 0;
  const done = counts?.done ?? 0;
  return total ? `${done}/${total}` : "0";
}

type Props = {
  tripId: string;
  isPremium?: boolean;
  onGenerateWithAi?: () => void;
};

export default function TripListsPanel({ tripId, isPremium = false, onGenerateWithAi }: Props) {
  const { lists, countsByList, access, loading, saving, error, createList, updateList, deleteList } =
    useTripLists(tripId);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(() => lists.find((l) => l.id === selectedId) ?? null, [lists, selectedId]);

  useEffect(() => {
    if (!selectedId && lists.length) setSelectedId(lists[0].id);
    if (selectedId && !lists.some((l) => l.id === selectedId)) setSelectedId(lists[0]?.id ?? null);
  }, [lists, selectedId]);

  const itemsApi = useTripListItems(tripId, selectedId);

  const [newTitle, setNewTitle] = useState("");
  const [newVisibility, setNewVisibility] = useState<"private" | "shared">("shared");
  const [newEditableByAll, setNewEditableByAll] = useState(true);

  const [newItemText, setNewItemText] = useState("");
  const [newItemQty, setNewItemQty] = useState<string>("");
  const [newItemNote, setNewItemNote] = useState("");

  const [auditOpen, setAuditOpen] = useState(false);
  const [auditTarget, setAuditTarget] = useState<{ entityType: string; entityId: string; title: string } | null>(
    null
  );

  const [aiOpen, setAiOpen] = useState(false);

  async function handleCreateList() {
    const title = newTitle.trim();
    if (!title) return;
    await createList({ title, visibility: newVisibility, editable_by_all: newVisibility === "shared" ? newEditableByAll : false });
    setNewTitle("");
    setNewVisibility("shared");
    setNewEditableByAll(true);
  }

  async function handleAddItem() {
    const text = newItemText.trim();
    if (!text || !selectedId) return;
    const qty = newItemQty.trim() ? Number(newItemQty) : null;
    await itemsApi.createItem({
      text,
      qty: Number.isFinite(qty as any) ? (qty as any) : null,
      note: newItemNote.trim() ? newItemNote.trim() : null,
    });
    setNewItemText("");
    setNewItemQty("");
    setNewItemNote("");
  }

  const canAi = Boolean(isPremium);
  const canManageResources = access?.canManageResources ?? true;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Listas</h3>
          <p className="mt-1 text-sm text-slate-500">Crea listas privadas o compartidas (compra, maleta, documentos…).</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canAi ? (
            <button
              type="button"
              onClick={() => setAiOpen(true)}
              className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Generar con IA
            </button>
          ) : (
            <button
              type="button"
              disabled
              className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-400"
              title="Disponible en Premium"
            >
              Generar con IA (Premium)
            </button>
          )}
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Crear lista</div>
            <div className="mt-3 space-y-2">
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Ej: Lista de la compra"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cyan-200"
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <select
                  value={newVisibility}
                  onChange={(e) => setNewVisibility(e.target.value === "private" ? "private" : "shared")}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="shared">Compartida</option>
                  <option value="private">Privada</option>
                </select>
                <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={newEditableByAll}
                    onChange={(e) => setNewEditableByAll(e.target.checked)}
                    disabled={newVisibility !== "shared"}
                  />
                  Editable por todos
                </label>
              </div>
              <button
                type="button"
                onClick={handleCreateList}
                disabled={saving || !newTitle.trim() || !canManageResources}
                className="w-full rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Crear
              </button>
              {!canManageResources ? (
                <div className="text-xs text-slate-500">No tienes permisos para gestionar recursos en este viaje.</div>
              ) : null}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Tus listas
            </div>
            {loading ? (
              <div className="px-4 py-4 text-sm text-slate-500">Cargando…</div>
            ) : lists.length === 0 ? (
              <div className="px-4 py-4 text-sm text-slate-500">Aún no hay listas.</div>
            ) : (
              <div className="max-h-[420px] overflow-auto">
                {lists.map((l) => {
                  const active = l.id === selectedId;
                  const counts = countsByList[String(l.id)];
                  return (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => setSelectedId(l.id)}
                      className={`flex w-full items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-left text-sm transition hover:bg-slate-50 ${
                        active ? "bg-slate-50" : "bg-white"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-slate-900">{l.title}</div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {l.visibility === "private" ? "Privada" : "Compartida"}
                          {l.visibility === "shared" ? (l.editable_by_all ? " · editable por todos" : " · editable por roles") : ""}
                        </div>
                      </div>
                      <div className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                        {fmtCount(counts)}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        <div className="space-y-4">
          {!selected ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-sm text-slate-500">
              Selecciona una lista para ver sus elementos.
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Lista</div>
                    <div className="mt-1 truncate text-lg font-bold text-slate-950">{selected.title}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {selected.visibility === "private" ? "Privada" : "Compartida"} ·{" "}
                      {selected.visibility === "shared"
                        ? selected.editable_by_all
                          ? "editable por todos"
                          : "editable por roles"
                        : "solo tú"}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setAuditTarget({ entityType: "list", entityId: selected.id, title: selected.title });
                        setAuditOpen(true);
                      }}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      disabled={saving}
                    >
                      Historial
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const title = window.prompt("Nuevo nombre de la lista", selected.title);
                        if (!title) return;
                        void updateList(selected.id, { title });
                      }}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      disabled={saving}
                    >
                      Renombrar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const next = selected.visibility === "private" ? "shared" : "private";
                        void updateList(selected.id, { visibility: next });
                      }}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      disabled={saving}
                    >
                      {selected.visibility === "private" ? "Hacer compartida" : "Hacer privada"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void deleteList(selected.id);
                      }}
                      className="rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50"
                      disabled={saving}
                    >
                      Eliminar
                    </button>
                  </div>
                </div>

                {selected.visibility === "shared" ? (
                  <div className="mt-3">
                    <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={selected.editable_by_all}
                        onChange={(e) => void updateList(selected.id, { editable_by_all: e.target.checked })}
                        disabled={saving}
                      />
                      Editable por todos
                    </label>
                    <div className="mt-1 text-xs text-slate-500">
                      (Según tu regla, solo el owner de la lista puede cambiar esto.)
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white">
                <div className="border-b border-slate-200 px-4 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Elementos
                </div>
                {itemsApi.error ? (
                  <div className="px-4 py-3 text-sm text-red-700">{itemsApi.error}</div>
                ) : null}
                {itemsApi.loading ? (
                  <div className="px-4 py-4 text-sm text-slate-500">Cargando…</div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {itemsApi.items.length === 0 ? (
                      <div className="px-4 py-4 text-sm text-slate-500">Esta lista está vacía.</div>
                    ) : (
                      itemsApi.items.map((it) => (
                        <div key={it.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex min-w-0 items-start gap-3">
                            <input
                              type="checkbox"
                              checked={it.is_done}
                              onChange={(e) => void itemsApi.updateItem(it.id, { is_done: e.target.checked })}
                              className="mt-1"
                            />
                            <div className="min-w-0">
                              <input
                                value={it.text}
                                onChange={(e) => void itemsApi.updateItem(it.id, { text: e.target.value })}
                                className={`w-full rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-semibold outline-none focus:border-slate-200 focus:bg-white ${
                                  it.is_done ? "line-through text-slate-400" : "text-slate-900"
                                }`}
                              />
                              <div className="mt-1 grid gap-2 sm:grid-cols-2">
                                <input
                                  value={it.qty ?? ""}
                                  onChange={(e) => void itemsApi.updateItem(it.id, { qty: e.target.value ? Number(e.target.value) : null })}
                                  type="number"
                                  step="0.5"
                                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                                  placeholder="Cantidad"
                                />
                                <input
                                  value={it.note ?? ""}
                                  onChange={(e) => void itemsApi.updateItem(it.id, { note: e.target.value || null })}
                                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                                  placeholder="Nota"
                                />
                              </div>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setAuditTarget({ entityType: "list_item", entityId: it.id, title: `Item: ${it.text}` });
                                setAuditOpen(true);
                              }}
                              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                              title="Ver historial del item"
                            >
                              Historial
                            </button>
                            <button
                              type="button"
                              onClick={() => void itemsApi.deleteItem(it.id)}
                              className="rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                            >
                              Borrar
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                <div className="border-t border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px]">
                    <input
                      value={newItemText}
                      onChange={(e) => setNewItemText(e.target.value)}
                      placeholder="Añadir elemento…"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    />
                    <div className="flex gap-2">
                      <input
                        value={newItemQty}
                        onChange={(e) => setNewItemQty(e.target.value)}
                        placeholder="Cantidad"
                        type="number"
                        step="0.5"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                      />
                      <button
                        type="button"
                        onClick={handleAddItem}
                        disabled={itemsApi.saving || !newItemText.trim()}
                        className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        Añadir
                      </button>
                    </div>
                  </div>
                  <input
                    value={newItemNote}
                    onChange={(e) => setNewItemNote(e.target.value)}
                    placeholder="Nota (opcional)…"
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="text-xs text-slate-500">
                Historial completo disponible vía auditoría del viaje (se registran create/update/delete).
              </div>
            </>
          )}
        </div>
      </div>

      <AuditLogDialog
        open={auditOpen && Boolean(auditTarget)}
        onClose={() => setAuditOpen(false)}
        tripId={tripId}
        entityType={auditTarget?.entityType || "list"}
        entityId={auditTarget?.entityId || ""}
        title={auditTarget?.title || "Historial"}
      />

      <AiListDraftDialog
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        tripId={tripId}
        onConfirmCreate={async (draft) => {
          const created = await createList({ title: draft.title, visibility: "shared", editable_by_all: true });
          const listId = created?.id || null;
          if (!listId) throw new Error("No se pudo crear la lista.");
          for (const it of draft.items) {
            const res = await fetch(`/api/trip-lists/${encodeURIComponent(listId)}/items`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ tripId, text: it.text, qty: it.qty, note: it.note }),
            });
            if (!res.ok) {
              const text = await res.text();
              throw new Error(text || "No se pudo crear uno de los items.");
            }
          }
          setSelectedId(listId);
        }}
      />
    </section>
  );
}

