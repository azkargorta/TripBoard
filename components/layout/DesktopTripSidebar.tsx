"use client";

import type React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { TRIP_TAB_SUMMARY_SRC, tripTabDocsImageClass } from "@/lib/trip-tab-assets";

type Props = {
  tripId: string;
  isPremium: boolean;
};

const items: Array<{ key: string; label: string; icon: React.ReactNode; href: (id: string) => string }> = [
  {
    key: "summary",
    label: "Resumen",
    icon: <Image src={TRIP_TAB_SUMMARY_SRC} alt="" width={22} height={22} className="h-[22px] w-[22px] object-contain" />,
    href: (id: string) => `/trip/${id}/summary`,
  },
  {
    key: "plan",
    label: "Plan",
    icon: <Image src="/brand/tabs/plan.png" alt="" width={22} height={22} className="h-[22px] w-[22px] object-contain" />,
    href: (id: string) => `/trip/${id}/plan`,
  },
  {
    key: "map",
    label: "Rutas",
    icon: <Image src="/brand/tabs/map.png" alt="" width={22} height={22} className="h-[22px] w-[22px] object-contain" />,
    href: (id: string) => `/trip/${id}/map`,
  },
  {
    key: "expenses",
    label: "Gastos",
    icon: <Image src="/brand/tabs/expenses.png" alt="" width={22} height={22} className="h-[22px] w-[22px] object-contain" />,
    href: (id: string) => `/trip/${id}/expenses`,
  },
  {
    key: "participants",
    label: "Gente",
    icon: <Image src="/brand/tabs/participants.png" alt="" width={22} height={22} className="h-[22px] w-[22px] object-contain" />,
    href: (id: string) => `/trip/${id}/participants`,
  },
  {
    key: "resources",
    label: "Docs",
    icon: (
      <Image
        src="/brand/tabs/documents.png"
        alt=""
        width={32}
        height={32}
        className={`h-[22px] w-[22px] max-h-full max-w-full ${tripTabDocsImageClass}`}
      />
    ),
    href: (id: string) => `/trip/${id}/resources`,
  },
  {
    key: "chat",
    label: "Asistente personal",
    icon: <Image src="/brand/tabs/ai.png" alt="" width={22} height={22} className="h-[22px] w-[22px] object-contain" />,
    href: (id: string) => `/trip/${id}/ai-chat`,
  },
];

function isActivePath(pathname: string, href: string, key: string) {
  if (pathname === href) return true;
  if (key === "map" && pathname.startsWith(`${href}/`)) return true; // URL /map; pestaña «Rutas»
  return false;
}

export default function DesktopTripSidebar({ tripId, isPremium }: Props) {
  const pathname = usePathname();
  const visibleItems = items;

  return (
    <aside className="hidden md:block w-[200px] lg:w-[220px] shrink-0">
      <div className="sticky top-24">
        <div className="rounded-3xl border border-slate-200 bg-white/90 p-2 backdrop-blur supports-[backdrop-filter]:bg-white/75 shadow-sm">
          <div className="px-2 pb-2 pt-1">
            <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-400">Navegación</div>
            <div className="mt-1 text-sm font-extrabold text-slate-900">Tu viaje</div>
          </div>
          <nav aria-label="Navegación del viaje (escritorio)" className="space-y-1">
            {visibleItems.map((item) => {
              const href = item.href(tripId);
              const active = isActivePath(pathname, href, item.key);
              return (
                <Link
                  key={item.key}
                  href={href}
                  prefetch
                  title={item.label}
                  className={`group relative flex min-h-[44px] items-center gap-3 rounded-2xl px-3 py-2 text-sm font-semibold transition ${
                    active
                      ? "bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-sm"
                      : "text-slate-700 hover:bg-slate-50 hover:text-slate-950"
                  }`}
                >
                  {/* Active indicator */}
                  {active ? (
                    <span
                      className="absolute left-1 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full bg-white/80"
                      aria-hidden
                    />
                  ) : (
                    <span className="absolute left-1 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full bg-transparent" aria-hidden />
                  )}

                  <span
                    className={`relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-2xl ${
                      active
                        ? "bg-white/10"
                        : "bg-slate-50 group-hover:bg-white"
                    }`}
                    aria-hidden
                  >
                    {item.icon}
                  </span>

                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </aside>
  );
}

