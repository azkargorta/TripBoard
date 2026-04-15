"use client";

import type React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

type Props = {
  tripId: string;
  isPremium: boolean;
};

const items: Array<{ key: string; label: string; icon: React.ReactNode; href: (id: string) => string }> = [
  { key: "overview", label: "Inicio", icon: "🏠", href: (id: string) => `/trip/${id}` },
  {
    key: "plan",
    label: "Plan",
    icon: <Image src="/brand/tabs/plan.png" alt="" width={22} height={22} className="h-[22px] w-[22px] object-contain" />,
    href: (id: string) => `/trip/${id}/plan`,
  },
  {
    key: "map",
    label: "Mapa",
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
    icon: <Image src="/brand/tabs/documents.png" alt="" width={22} height={22} className="h-[22px] w-[22px] object-contain" />,
    href: (id: string) => `/trip/${id}/resources`,
  },
  {
    key: "chat",
    label: "IA",
    icon: <Image src="/brand/tabs/ai.png" alt="" width={22} height={22} className="h-[22px] w-[22px] object-contain" />,
    href: (id: string) => `/trip/${id}/ai-chat`,
  },
];

function isActivePath(pathname: string, href: string, key: string) {
  if (pathname === href) return true;
  if (key === "map" && pathname.startsWith(`${href}/`)) return true;
  return false;
}

export default function DesktopTripSidebar({ tripId, isPremium }: Props) {
  const pathname = usePathname();
  const visibleItems = items;

  return (
    <aside className="hidden md:block">
      <div className="sticky top-24">
        <div className="rounded-3xl border border-slate-200 bg-white/85 p-2 backdrop-blur supports-[backdrop-filter]:bg-white/70">
          <nav aria-label="Navegación del viaje (escritorio)" className="space-y-1">
            {visibleItems.map((item) => {
              const href = item.href(tripId);
              const active = isActivePath(pathname, href, item.key);
              return (
                <Link
                  key={item.key}
                  href={href}
                  prefetch
                  className={`flex min-h-[40px] items-center gap-3 rounded-2xl px-2.5 py-2 text-[13px] font-semibold transition ${
                    active
                      ? "bg-cyan-100 text-cyan-950"
                      : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                  }`}
                >
                  <span className="shrink-0 text-xl leading-none" aria-hidden>
                    {item.icon}
                  </span>
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </aside>
  );
}

