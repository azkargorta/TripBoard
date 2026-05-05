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

const items: Array<{ key: string; label: string; icon: React.ReactNode; href: (id: string) => string; isAI?: boolean }> = [
  {
    key: "summary",
    label: "Inicio",
    icon: <Image src={TRIP_TAB_SUMMARY_SRC} alt="" width={24} height={24} className="object-contain" />,
    href: (id) => `/trip/${id}/summary`,
  },
  {
    key: "plan",
    label: "Plan",
    icon: <Image src="/brand/tabs/plan.png" alt="" width={24} height={24} className="object-contain" />,
    href: (id) => `/trip/${id}/plan`,
  },
  {
    key: "map",
    label: "Rutas",
    icon: <Image src="/brand/tabs/map.png" alt="" width={24} height={24} className="object-contain" />,
    href: (id) => `/trip/${id}/map`,
  },
  {
    key: "expenses",
    label: "Gastos",
    icon: <Image src="/brand/tabs/expenses.png" alt="" width={24} height={24} className="object-contain" />,
    href: (id) => `/trip/${id}/expenses`,
  },
  {
    key: "participants",
    label: "Gente",
    icon: <Image src="/brand/tabs/participants.png" alt="" width={24} height={24} className="object-contain" />,
    href: (id) => `/trip/${id}/participants`,
  },
  {
    key: "resources",
    label: "Docs",
    icon: <Image src="/brand/tabs/documents.png" alt="" width={24} height={24} className={`object-contain ${tripTabDocsImageClass}`} />,
    href: (id) => `/trip/${id}/resources`,
  },
  {
    key: "chat",
    label: "IA",
    icon: <Image src="/brand/tabs/ai.png" alt="" width={24} height={24} className="object-contain" />,
    href: (id) => `/trip/${id}/ai-chat`,
    isAI: true,
  },
];

export default function MobileBottomNav({ tripId, isPremium }: Props) {
  const pathname = usePathname();
  const visibleItems = isPremium ? items : items.filter((i) => i.key !== "chat");

  function isActivePath(href: string, key: string) {
    if (pathname === href) return true;
    if (key === "map" && pathname.startsWith(`${href}/`)) return true;
    return false;
  }

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 md:hidden"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 6px)" }}
      aria-label="Navegación del viaje"
    >
      <div className="mx-2 mb-1 overflow-hidden rounded-2xl border border-slate-200/90 bg-white/96 shadow-[0_-4px_24px_rgba(15,23,42,0.10)] backdrop-blur-xl supports-[backdrop-filter]:bg-white/92">
        <div className="flex">
          {visibleItems.map((item) => {
            const href = item.href(tripId);
            const active = isActivePath(href, item.key);

            return (
              <Link
                key={item.key}
                href={href}
                className={`
                  relative flex flex-1 flex-col items-center justify-center gap-1 py-2.5 min-h-[56px]
                  transition-all duration-150
                  ${active ? "text-slate-950" : "text-slate-500 hover:text-slate-700"}
                `}
                title={item.label}
              >
                {/* Active pill bg */}
                {active && (
                  <span
                    className={`
                      absolute inset-x-1 top-1 bottom-1 rounded-xl
                      ${item.isAI
                        ? "bg-gradient-to-b from-violet-100 to-indigo-50"
                        : "bg-slate-100"
                      }
                    `}
                    aria-hidden
                  />
                )}

                {/* Icon */}
                <span
                  className={`
                    relative z-10 flex h-6 w-6 items-center justify-center transition-transform duration-150
                    ${active ? "scale-110" : ""}
                    ${item.isAI && active ? "[filter:hue-rotate(0deg)_saturate(1.5)_brightness(0.9)]" : ""}
                  `}
                  aria-hidden
                >
                  {item.icon}
                </span>

                {/* Label */}
                <span
                  className={`
                    relative z-10 text-[9px] font-semibold leading-none tracking-wide
                    ${active
                      ? item.isAI ? "text-violet-700" : "text-slate-900"
                      : "text-slate-400"
                    }
                  `}
                >
                  {item.label}
                </span>

                {/* Active dot */}
                {active && (
                  <span
                    className={`absolute bottom-1.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full ${item.isAI ? "bg-violet-500" : "bg-slate-900"}`}
                    aria-hidden
                  />
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
