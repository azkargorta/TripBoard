"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import PlaceAutocompleteInput from "@/components/PlaceAutocompleteInput";
import { FolderPlus, MapPin, Plus, RefreshCcw, Save, Trash2 } from "lucide-react";

type Folder = {
  id: string;
  trip_id: string;
  name: string;
  color?: string | null;
};

type PlaceRow = {
  id: string;
  trip_id: string;
  folder_id: string | null;
  place_id: string | null;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  category: string | null;
  notes: string | null;
};

type PendingPlace = {
  place_id: string | null;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  category: string | null;
};

function categoryEmoji(category: string | null | undefined) {
  const c = (category || "").toLowerCase();
  if (c.includes("restaurant") || c.includes("food") || c.includes("cafe")) return "🍽️";
  if (c.includes("museum")) return "🏛️";
  if (c.includes("park") || c.includes("nature")) return "🌿";
  if (c.includes("activity")) return "🎟️";
  if (c.includes("transport")) return "🚆";
  if (c.includes("lodging") || c.includes("hotel")) return "🏨";
  return "📍";
}

export default function TripExploreView({ tripId }: { tripId: string }) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map());

  const [folders, setFolders] = useState<Folder[]>([]);
  const [places, setPlaces] = useState<PlaceRow[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | "all">("all");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderName, setFolderName] = useState("");

  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<PendingPlace | null>(null);
  const [pendingFolderId, setPendingFolderId] = useState<string | "none">("none");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canUseGoogle = useMemo(() => typeof window !== "undefined" && !!window.google?.maps, []);

  async function loadAll() {
    setError(null);
    const [fRes, pRes] = await Promise.all([
      fetch(`/api/trip-place-folders?tripId=${encodeURIComponent(tripId)}`),
      fetch(`/api/trip-places?tripId=${encodeURIComponent(tripId)}`),
    ]);
    const fJson = await fRes.json().catch(() => null);
    const pJson = await pRes.json().catch(() => null);
    if (!fRes.ok) throw new Error(fJson?.error || "No se pudieron cargar carpetas.");
    if (!pRes.ok) throw new Error(pJson?.error || "No se pudieron cargar lugares.");
    setFolders(Array.isArray(fJson?.folders) ? fJson.folders : []);
    setPlaces(Array.isArray(pJson?.places) ? pJson.places : []);
  }

  useEffect(() => {
    void loadAll().catch((e) => setError(e instanceof Error ? e.message : "Error cargando explorador."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  useEffect(() => {
    if (!canUseGoogle) return;
    if (!mapRef.current) return;
    if (mapInstanceRef.current) return;

    mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
      center: { lat: 40.4168, lng: -3.7038 },
      zoom: 4,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    });
  }, [canUseGoogle]);

  const visiblePlaces = useMemo(() => {
    if (selectedFolderId === "all") return places;
    return places.filter((p) => p.folder_id === selectedFolderId);
  }, [places, selectedFolderId]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // clear old markers
    for (const marker of markersRef.current.values()) {
      marker.setMap(null);
    }
    markersRef.current.clear();

    for (const p of visiblePlaces) {
      if (typeof p.latitude !== "number" || typeof p.longitude !== "number") continue;
      const emoji = categoryEmoji(p.category);
      const marker = new window.google.maps.Marker({
        map,
        position: { lat: p.latitude, lng: p.longitude },
        title: p.name,
        label: {
          text: emoji,
          fontSize: "16px",
        },
      });
      markersRef.current.set(p.id, marker);
    }

    if (pending && typeof pending.latitude === "number" && typeof pending.longitude === "number") {
      const marker = new window.google.maps.Marker({
        map,
        position: { lat: pending.latitude, lng: pending.longitude },
        title: pending.name,
        label: { text: "✨", fontSize: "16px" },
      });
      markersRef.current.set("__pending__", marker);
      map.panTo({ lat: pending.latitude, lng: pending.longitude });
      map.setZoom(Math.max(map.getZoom() || 10, 12));
    }
  }, [visiblePlaces, pending]);

  async function createFolder() {
    const name = folderName.trim();
    if (!name) return;
    setCreatingFolder(true);
    setError(null);
    try {
      const res = await fetch("/api/trip-place-folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, name }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "No se pudo crear carpeta.");
      setFolderName("");
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear carpeta.");
    } finally {
      setCreatingFolder(false);
    }
  }

  async function savePlace() {
    if (!pending) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/trip-places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId,
          folderId: pendingFolderId === "none" ? null : pendingFolderId,
          ...pending,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "No se pudo guardar el lugar.");
      setPending(null);
      setQuery("");
      setPendingFolderId("none");
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el lugar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="space-y-4">
        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : null}

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-extrabold text-slate-950">Carpetas</div>
            <button
              type="button"
              onClick={() => void loadAll().catch((e) => setError(e instanceof Error ? e.message : "Error"))}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <RefreshCcw className="h-4 w-4" aria-hidden />
              Recargar
            </button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedFolderId("all")}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                selectedFolderId === "all"
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              Todas
            </button>
            {folders.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setSelectedFolderId(f.id)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  selectedFolderId === f.id
                    ? "border-violet-300 bg-violet-50 text-violet-900"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {f.name}
              </button>
            ))}
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center gap-2 text-xs font-extrabold text-slate-700">
              <FolderPlus className="h-4 w-4" aria-hidden />
              Nueva carpeta
            </div>
            <div className="mt-2 flex gap-2">
              <input
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="Ej. Restaurantes"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
              />
              <button
                type="button"
                disabled={creatingFolder || !folderName.trim()}
                onClick={() => void createFolder()}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                <Plus className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm font-extrabold text-slate-950">Buscar y guardar</div>
          <div className="mt-3">
            <PlaceAutocompleteInput
              value={query}
              onChange={setQuery}
              label="Buscar lugar"
              placeholder="Restaurante, museo, actividad…"
              onPlaceSelect={(payload) => {
                setPending({
                  place_id: null,
                  name: payload.address,
                  address: payload.address,
                  latitude: payload.latitude,
                  longitude: payload.longitude,
                  category: null,
                });
              }}
            />
          </div>

          {pending ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Selección</div>
                  <div className="mt-1 text-sm font-semibold text-slate-900 line-clamp-2">{pending.name}</div>
                  {pending.address ? <div className="mt-1 text-xs text-slate-600 line-clamp-2">{pending.address}</div> : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPending(null)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cerrar
                  </button>
                </div>
              </div>

              <div className="mt-3 grid gap-3">
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-slate-700">Carpeta</span>
                  <select
                    value={pendingFolderId}
                    onChange={(e) => setPendingFolderId(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
                  >
                    <option value="none">Sin carpeta</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void savePlace()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-60"
                >
                  <Save className="h-4 w-4" aria-hidden />
                  {saving ? "Guardando..." : "Guardar en carpetas"}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm font-extrabold text-slate-950">Guardados</div>
          <div className="mt-3 space-y-2">
            {visiblePlaces.length ? (
              visiblePlaces.slice(0, 30).map((p) => (
                <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-extrabold text-slate-900 line-clamp-1">
                        {categoryEmoji(p.category)} {p.name}
                      </div>
                      {p.address ? <div className="mt-1 text-[11px] text-slate-600 line-clamp-2">{p.address}</div> : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (!mapInstanceRef.current) return;
                        if (typeof p.latitude !== "number" || typeof p.longitude !== "number") return;
                        mapInstanceRef.current.panTo({ lat: p.latitude, lng: p.longitude });
                        mapInstanceRef.current.setZoom(14);
                      }}
                      className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      <MapPin className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                Todavía no has guardado lugares. Busca arriba y guárdalos en una carpeta.
              </div>
            )}
          </div>
        </div>
      </aside>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div ref={mapRef} className="h-[520px] w-full" />
        {!canUseGoogle ? (
          <div className="border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
            Cargando Google Maps… (revisa `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`).
          </div>
        ) : null}
      </section>
    </div>
  );
}

