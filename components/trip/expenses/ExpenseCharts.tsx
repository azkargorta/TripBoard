"use client";

import { useMemo } from "react";
import type { TripExpenseRecord } from "@/hooks/useTripExpenses";

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  expenses: TripExpenseRecord[];
  baseCurrency: string;
};

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  general:       { label: "General",        color: "#94a3b8" },
  transport:     { label: "Transporte",     color: "#0ea5e9" },
  accommodation: { label: "Alojamiento",    color: "#8b5cf6" },
  food:          { label: "Comida",         color: "#f97316" },
  activities:    { label: "Actividades",    color: "#10b981" },
  shopping:      { label: "Compras",        color: "#a855f7" },
  health:        { label: "Salud",          color: "#ef4444" },
  other:         { label: "Otros",          color: "#64748b" },
};

const PALETTE = [
  "#7c3aed", "#0ea5e9", "#10b981", "#f97316",
  "#a855f7", "#f59e0b", "#ef4444", "#64748b",
];

function colorForCat(cat: string, idx: number): string {
  return CATEGORY_LABELS[cat]?.color ?? PALETTE[idx % PALETTE.length]!;
}

function labelForCat(cat: string): string {
  return CATEGORY_LABELS[cat]?.label ?? (cat.slice(0, 1).toUpperCase() + cat.slice(1));
}

function formatMoney(n: number, currency: string) {
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency", currency, maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${Math.round(n)} ${currency}`;
  }
}

// ─── Donut chart (pure SVG) ───────────────────────────────────────────────────

function DonutChart({
  segments,
  total,
  currency,
}: {
  segments: Array<{ label: string; value: number; color: string }>;
  total: number;
  currency: string;
}) {
  const R = 70;
  const CX = 90;
  const CY = 90;
  const STROKE = 22;

  // Build SVG arcs
  let cumAngle = -Math.PI / 2;
  const arcs = segments.map((seg) => {
    const fraction = total > 0 ? seg.value / total : 0;
    const sweep = fraction * 2 * Math.PI;
    const start = cumAngle;
    const end = cumAngle + sweep;
    cumAngle = end;

    const x1 = CX + R * Math.cos(start);
    const y1 = CY + R * Math.sin(start);
    const x2 = CX + R * Math.cos(end);
    const y2 = CY + R * Math.sin(end);
    const largeArc = sweep > Math.PI ? 1 : 0;

    return { ...seg, d: `M ${CX} ${CY} L ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2} Z`, fraction };
  });

  return (
    <svg viewBox="0 0 180 180" className="w-full max-w-[180px] mx-auto">
      {arcs.map((arc, i) => (
        <path key={i} d={arc.d} fill={arc.color} opacity={0.9}>
          <title>{arc.label}: {formatMoney(arc.value, currency)} ({Math.round(arc.fraction * 100)}%)</title>
        </path>
      ))}
      {/* Center hole */}
      <circle cx={CX} cy={CY} r={R - STROKE} fill="white" />
      {/* Center text */}
      <text x={CX} y={CY - 6} textAnchor="middle" fontSize="11" fontWeight="700" fill="#1e293b">
        Total
      </text>
      <text x={CX} y={CY + 10} textAnchor="middle" fontSize="9" fill="#64748b">
        {formatMoney(total, currency)}
      </text>
    </svg>
  );
}

// ─── Horizontal bar chart ─────────────────────────────────────────────────────

function HBarChart({
  bars,
  max,
  currency,
}: {
  bars: Array<{ label: string; value: number; color: string }>;
  max: number;
  currency: string;
}) {
  return (
    <div className="space-y-2.5">
      {bars.map((bar, i) => (
        <div key={i}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-slate-700 truncate max-w-[130px]">{bar.label}</span>
            <span className="text-xs font-bold text-slate-900 ml-2 shrink-0">{formatMoney(bar.value, currency)}</span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${max > 0 ? (bar.value / max) * 100 : 0}%`,
                backgroundColor: bar.color,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ExpenseCharts({ expenses, baseCurrency }: Props) {
  // Group by category
  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) {
      const cat = (e.category || "general").toLowerCase();
      map.set(cat, (map.get(cat) ?? 0) + Number(e.amount || 0));
    }
    return Array.from(map.entries())
      .map(([cat, value], i) => ({ label: labelForCat(cat), value, color: colorForCat(cat, i) }))
      .sort((a, b) => b.value - a.value);
  }, [expenses]);

  // Group by payer
  const byPayer = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) {
      const payer = e.payer_name || "Desconocido";
      map.set(payer, (map.get(payer) ?? 0) + Number(e.amount || 0));
    }
    return Array.from(map.entries())
      .map(([label, value], i) => ({ label, value, color: PALETTE[i % PALETTE.length]! }))
      .sort((a, b) => b.value - a.value);
  }, [expenses]);

  // Monthly evolution
  const byMonth = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) {
      const date = e.expense_date || e.created_at || "";
      const month = date.slice(0, 7); // YYYY-MM
      if (!month) continue;
      map.set(month, (map.get(month) ?? 0) + Number(e.amount || 0));
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, value]) => ({ label: month, value }));
  }, [expenses]);

  const totalCat = byCategory.reduce((a, b) => a + b.value, 0);
  const maxPayer = Math.max(...byPayer.map((b) => b.value), 1);
  const maxMonth = Math.max(...byMonth.map((b) => b.value), 1);

  if (expenses.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
        Aún no hay gastos para mostrar estadísticas.
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Top row: donut + legend */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-extrabold text-slate-900 mb-4">Gasto por categoría</p>
        <div className="flex flex-col sm:flex-row gap-6 items-start">
          <div className="w-full sm:w-48 shrink-0">
            <DonutChart segments={byCategory} total={totalCat} currency={baseCurrency} />
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            {byCategory.map((seg, i) => (
              <div key={i} className="flex items-center gap-2.5">
                <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
                <span className="text-xs font-semibold text-slate-700 flex-1 truncate">{seg.label}</span>
                <span className="text-xs font-bold text-slate-900">{formatMoney(seg.value, baseCurrency)}</span>
                <span className="text-xs text-slate-400 w-9 text-right">
                  {Math.round((seg.value / totalCat) * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Gasto por persona */}
      {byPayer.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-extrabold text-slate-900 mb-4">Pagado por persona</p>
          <HBarChart bars={byPayer} max={maxPayer} currency={baseCurrency} />
        </div>
      )}

      {/* Evolución mensual */}
      {byMonth.length > 1 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-extrabold text-slate-900 mb-4">Evolución mensual</p>
          <div className="flex items-end gap-2 h-28">
            {byMonth.map((m, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full rounded-t-lg bg-violet-400 transition-all"
                  style={{ height: `${(m.value / maxMonth) * 96}px` }}
                  title={`${m.label}: ${formatMoney(m.value, baseCurrency)}`}
                />
                <span className="text-[9px] text-slate-400 font-semibold">{m.label.slice(5)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
