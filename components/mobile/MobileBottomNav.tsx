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
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 10px)" }}
    >
      <div className="overflow-x-auto no-scrollbar">
        <div className="mx-auto flex min-w-max items-stretch px-2">
          {visibleItems.map((item) => {
            const href = item.href(tripId);
            const active = pathname === href;

            return (
              <Link
                key={item.key}
                href={href}
                prefetch
                className={`flex min-w-[78px] flex-col items-center justify-center gap-1 px-3 py-3 text-[11px] font-semibold ${
                  active ? "text-violet-700" : "text-slate-500"
                }`}
              >
                <span className="text-lg leading-none">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
