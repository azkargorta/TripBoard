"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Props = {
  tripId: string;
  isPremium: boolean;
};

const items = [
  { key: "overview", label: "Inicio", icon: "🏠", href: (id: string) => `/trip/${id}` },
  { key: "plan", label: "Plan", icon: "🗓️", href: (id: string) => `/trip/${id}/plan` },
  { key: "map", label: "Mapa", icon: "🗺️", href: (id: string) => `/trip/${id}/map` },
  { key: "expenses", label: "Gastos", icon: "💰", href: (id: string) => `/trip/${id}/expenses` },
  { key: "participants", label: "Gente", icon: "👥", href: (id: string) => `/trip/${id}/participants` },
  { key: "resources", label: "Docs", icon: "📎", href: (id: string) => `/trip/${id}/resources` },
  { key: "chat", label: "IA", icon: "🤖", href: (id: string) => `/trip/${id}/ai-chat` },
];

export default function MobileBottomNav({ tripId, isPremium }: Props) {
  const pathname = usePathname();
  const visibleItems = isPremium
    ? items
    : items.filter((item) => {
        if (item.key === "map" || item.key === "chat") return false;
        return true;
      });

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 md:hidden"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 8px)" }}
      aria-label="Navegación del viaje"
    >
      <div className="mx-2 mb-1 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-[0_-8px_32px_rgba(15,23,42,0.08)] backdrop-blur-md supports-[backdrop-filter]:bg-white/90">
        <div className="overflow-x-auto no-scrollbar">
          <div className="mx-auto flex min-w-max items-stretch px-1.5 py-1">
            {visibleItems.map((item) => {
              const href = item.href(tripId);
              const active = pathname === href;

              return (
                <Link
                  key={item.key}
                  href={href}
                  prefetch
                  className={`flex min-w-[72px] flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-2.5 text-[10px] font-semibold leading-tight transition ${
                    active
                      ? "bg-cyan-100 text-cyan-900 shadow-sm"
                      : "text-slate-500 active:bg-slate-100"
                  }`}
                >
                  <span className="text-[1.15rem] leading-none" aria-hidden>
                    {item.icon}
                  </span>
                  <span className="max-w-[4.5rem] truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
