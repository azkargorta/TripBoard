"use client";

import { useState } from "react";
import type { CountryBrief } from "@/app/api/trips/ai-brief/route";
import type { PackingCategory } from "@/app/api/trips/ai-packing-list/route";
import { Sparkles, Globe, Backpack, ChevronDown, ChevronUp, Loader2, CheckSquare, Square } from "lucide-react";

// ─── Country Brief ─────────────────────────────────────────────────────────────

function BriefRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 py-2.5 border-b border-slate-100 last:border-0">
      <span className="text-xs font-bold text-slate-400 w-28 shrink-0 pt-0.5">{label}</span>
      <span className="text-xs font-semibold text-slate-800 leading-relaxed">{value}</span>
    </div>
  );
}

function CountryBriefCard({ tripId, isPremium }: { tripId: string; isPremium: boolean }) {
  const [brief, setBrief] = useState<CountryBrief | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function load() {
    if (brief) { setOpen((v) => !v); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/trips/ai-brief?tripId=${encodeURIComponent(tripId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Error generando brief.");
      setBrief(data.brief);
      setOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error generando brief.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card-soft overflow-hidden">
      <button
        type="button"
        onClick={load}
        disabled={loading || !isPremium}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50/60 transition-colors disabled:opacity-60"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
            <Globe className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <p className="text-sm font-extrabold text-slate-900">Brief del destino</p>
            <p className="text-xs font-medium text-slate-400">
              {isPremium ? "Moneda, visado, enchufes, costumbres…" : "Requiere Premium"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {loading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
          {!loading && isPremium && (
            open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
          {isPremium && <span className="text-[10px] font-bold text-violet-600 bg-violet-50 border border-violet-200 rounded-full px-2 py-0.5">IA</span>}
        </div>
      </button>

      {error && (
        <div className="px-5 pb-4 text-xs font-semibold text-red-600">{error}</div>
      )}

      {open && brief && (
        <div className="border-t border-slate-100 px-5 pb-5 pt-4 space-y-1">
          <BriefRow label="💶 Moneda" value={`${brief.currency.code} (${brief.currency.symbol}) — ${brief.currency.tip}`} />
          <BriefRow label="🗣️ Idioma" value={brief.language} />
          <BriefRow label="🔌 Enchufe" value={`${brief.plugType} · ${brief.voltage}`} />
          <BriefRow label="🕐 Horario" value={brief.timeZone} />
          <BriefRow label="💸 Propinas" value={brief.tipping} />
          <BriefRow label="🛂 Visado" value={brief.visa} />
          <BriefRow label="💉 Vacunas" value={brief.vaccinations} />
          <BriefRow label="🚨 Emergencias" value={brief.emergency} />
          <BriefRow label="🚌 Transporte" value={brief.transport} />
          <BriefRow label="☀️ Mejor época" value={brief.bestTime} />
          {brief.customs.length > 0 && (
            <div className="pt-2">
              <p className="text-xs font-bold text-slate-400 mb-2">🧭 Costumbres a tener en cuenta</p>
              <ul className="space-y-1.5">
                {brief.customs.map((c, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs font-semibold text-slate-700">
                    <span className="mt-0.5 w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Packing List ──────────────────────────────────────────────────────────────

function PackingListCard({ tripId, isPremium }: { tripId: string; isPremium: boolean }) {
  const [categories, setCategories] = useState<PackingCategory[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [openCats, setOpenCats] = useState<Set<number>>(new Set([0]));

  async function load() {
    if (categories) { setOpen((v) => !v); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/trips/ai-packing-list?tripId=${encodeURIComponent(tripId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Error generando lista.");
      setCategories(data.categories);
      setOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error generando lista.");
    } finally {
      setLoading(false);
    }
  }

  function toggleItem(key: string) {
    setChecked((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  }

  function toggleCat(i: number) {
    setOpenCats((prev) => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  }

  const totalItems = categories?.reduce((a, c) => a + c.items.length, 0) ?? 0;
  const doneItems = checked.size;

  return (
    <div className="card-soft overflow-hidden">
      <button
        type="button"
        onClick={load}
        disabled={loading || !isPremium}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50/60 transition-colors disabled:opacity-60"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
            <Backpack className="w-4 h-4 text-emerald-600" />
          </div>
          <div>
            <p className="text-sm font-extrabold text-slate-900">Lista de maleta IA</p>
            <p className="text-xs font-medium text-slate-400">
              {isPremium
                ? categories
                  ? `${doneItems}/${totalItems} preparado`
                  : "Generada según tu destino y actividades"
                : "Requiere Premium"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {loading && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
          {!loading && isPremium && (
            open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
          {isPremium && <span className="text-[10px] font-bold text-violet-600 bg-violet-50 border border-violet-200 rounded-full px-2 py-0.5">IA</span>}
        </div>
      </button>

      {error && <div className="px-5 pb-4 text-xs font-semibold text-red-600">{error}</div>}

      {open && categories && (
        <div className="border-t border-slate-100 px-5 pb-5 pt-4 space-y-3">
          {/* Progress */}
          {totalItems > 0 && (
            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-500 mb-1.5">
                <span>Progreso</span>
                <span>{doneItems}/{totalItems}</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${totalItems > 0 ? (doneItems / totalItems) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}

          {/* Categories */}
          {categories.map((cat, ci) => {
            const catOpen = openCats.has(ci);
            const catDone = cat.items.filter((_, ii) => checked.has(`${ci}:${ii}`)).length;
            return (
              <div key={ci} className="rounded-xl border border-slate-100 overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleCat(ci)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">{cat.emoji}</span>
                    <span className="text-sm font-bold text-slate-900">{cat.name}</span>
                    <span className="text-xs font-semibold text-slate-400">{catDone}/{cat.items.length}</span>
                  </div>
                  {catOpen ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                </button>
                {catOpen && (
                  <div className="px-4 pb-3 space-y-2 border-t border-slate-50">
                    {cat.items.map((item, ii) => {
                      const key = `${ci}:${ii}`;
                      const done = checked.has(key);
                      return (
                        <button
                          key={ii}
                          type="button"
                          onClick={() => toggleItem(key)}
                          className="w-full flex items-start gap-2.5 py-1.5 text-left"
                        >
                          {done
                            ? <CheckSquare className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                            : <Square className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
                          }
                          <div className="flex-1 min-w-0">
                            <span className={`text-xs font-semibold ${done ? "line-through text-slate-400" : "text-slate-800"}`}>
                              {item.item}
                              {item.qty && <span className="ml-1 text-slate-400">× {item.qty}</span>}
                            </span>
                            {item.note && <p className="text-[10px] text-slate-400 mt-0.5">{item.note}</p>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          <button
            type="button"
            onClick={() => { setCategories(null); setChecked(new Set()); void load(); }}
            className="text-xs font-semibold text-violet-600 hover:text-violet-800 mt-2"
          >
            ↻ Regenerar lista
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function TripAiInsights({ tripId, isPremium }: { tripId: string; isPremium: boolean }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-violet-500" />
        <span className="text-xs font-bold uppercase tracking-widest text-violet-600">Asistente Premium</span>
      </div>
      <CountryBriefCard tripId={tripId} isPremium={isPremium} />
      <PackingListCard tripId={tripId} isPremium={isPremium} />
    </div>
  );
}
