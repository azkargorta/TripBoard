"use client";

import type React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { iconSlotNavBottom } from "@/components/ui/iconTokens";
import { TRIP_TAB_SUMMARY_SRC, tripTabDocsImageClass } from "@/lib/trip-tab-assets";

type Props = {
  tripId: string;
  isPremium: boolean;
};

const items: Array<{ key: string; label: string; icon: React.ReactNode; href: (id: string) => string }> = [
  {
    key: "summary",
    label: "Resumen",
    icon: <Image src={TRIP_TAB_SUMMARY_SRC} alt="" width={32} height={32} className="object-contain" />,
    href: (id: string) => `/trip/${id}/summary`,
  },
  {
    key: "plan",
    label: "Plan",
    icon: <Image src="/brand/tabs/plan.png" alt="" width={32} height={32} className="object-contain" />,
    href: (id: string) => `/trip/${id}/plan`,
  },
  {
    key: "map",
    label: "Rutas",
    icon: <Image src="/brand/tabs/map.png" alt="" width={32} height={32} className="object-contain" />,
    href: (id: string) => `/trip/${id}/map`,
  },
  {
    key: "expenses",
    label: "Gastos",
    icon: <Image src="/brand/tabs/expenses.png" alt="" width={32} height={32} className="object-contain" />,
    href: (id: string) => `/trip/${id}/expenses`,
  },
  {
    key: "participants",
    label: "Gente",
    icon: <Image src="/brand/tabs/participants.png" alt="" width={32} height={32} className="object-contain" />,
    href: (id: string) => `/trip/${id}/participants`,
  },
  {
    key: "resources",
    label: "Docs",
    icon: (
      <Image src="/brand/tabs/documents.png" alt="" width={32} height={32} className={tripTabDocsImageClass} />
    ),
    href: (id: string) => `/trip/${id}/resources`,
  },
  {
    key: "chat",
    label: "Asistente personal",
    icon: <Image src="/brand/tabs/ai.png" alt="" width={32} height={32} className="object-contain" />,
    href: (id: string) => `/trip/${id}/ai-chat`,
  },
];

export default function MobileBottomNav({ tripId, isPremium }: Props) {
  const pathname = usePathname();
  const visibleItems = isPremium ? items : items.filter((i) => i.key !== "chat");

  function isActivePath(href: string, key: string) {
    if (pathname === href) return true;
    // En rutas internas bajo /map, mantenemos «Rutas» activo.
    if (key === "map" && pathname.startsWith(`${href}/`)) return true;
    return false;
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 md:hidden"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 8px)" }}
      aria-label="Navegación del viaje"
    >
      <div className="mb-1 ml-[max(0.5rem,env(safe-area-inset-left))] mr-[max(0.5rem,env(safe-area-inset-right))] overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-[0_-8px_32px_rgba(15,23,42,0.08)] backdrop-blur-md supports-[backdrop-filter]:bg-white/90">
        <div className="overflow-x-auto no-scrollbar">
          <div className="mx-auto flex min-w-max items-stretch px-1 py-1.5">
            {visibleItems.map((item) => {
              const href = item.href(tripId);
              const active = isActivePath(href, item.key);

              return (
                <Link
                  key={item.key}
                  href={href}
                  prefetch
                  className={`flex min-h-[52px] min-w-[4.75rem] flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[11px] font-semibold leading-tight transition active:opacity-90 ${
                    active
                      ? "bg-violet-100 text-violet-900 shadow-sm"
                      : "text-slate-500 active:bg-slate-100"
                  }`}
                >
                  <span className={iconSlotNavBottom} aria-hidden>
                    {item.icon}
                  </span>
                  <span className="max-w-[4.5rem] whitespace-normal text-center text-[9px] font-semibold leading-[1.15] line-clamp-2">
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
