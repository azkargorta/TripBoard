"use client";

import type React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

type Props = {
  tripId: string;
  isPremium: boolean;
};

const items: Array<{
  key: string;
  label: string;
  icon: React.ReactNode;
  href: (id: string) => string;
}> = [
  {
    key: "summary",
    label: "Resumen",
    icon: <Image src="/brand/tabs/calendar.png" alt="" width={22} height={22} className="h-[22px] w-[22px] object-contain" />,
    href: (id: string) => `/trip/${id}/summary`,
  },
  {
    key: "plan",
    label: "Plan",
    icon: (
      <Image
        src="/brand/tabs/plan.png"
        alt=""
        width={22}
        height={22}
        className="h-[22px] w-[22px] object-contain"
      />
    ),
    href: (id: string) => `/trip/${id}/plan`,
  },
  {
    key: "map",
    label: "Mapa",
    icon: (
      <Image
        src="/brand/tabs/map.png"
        alt=""
        width={22}
        height={22}
        className="h-[22px] w-[22px] object-contain"
      />
    ),
    href: (id: string) => `/trip/${id}/map`,
  },
  { key: "expenses", label: "Gastos", icon: "💰", href: (id: string) => `/trip/${id}/expenses` },
  { key: "participants", label: "Gente", icon: "👥", href: (id: string) => `/trip/${id}/participants` },
  { key: "resources", label: "Docs", icon: "📎", href: (id: string) => `/trip/${id}/resources` },
  { key: "chat", label: "IA", icon: "🤖", href: (id: string) => `/trip/${id}/ai-chat` },
];

function isActivePath(pathname: string, href: string, key: string) {
  if (pathname === href) return true;
  // En rutas internas del mapa, mantenemos “Mapa” activo.
  if (key === "map" && pathname.startsWith(`${href}/`)) return true;
  return false;
}

export default function DesktopTripNav({ tripId, isPremium }: Props) {
  const pathname = usePathname();
  const visibleItems = isPremium ? items : items.filter((item) => item.key !== "chat");

  return (
    <nav
      className="fixed inset-x-0 top-[56px] z-40 hidden border-b border-slate-200 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/75 md:block"
      aria-label="Navegación del viaje"
    >
      <div className="page-shell max-w-[1200px] !py-2">
        <div className="flex flex-wrap gap-2">
          {visibleItems.map((item) => {
            const href = item.href(tripId);
            const active = isActivePath(pathname, href, item.key);
            return (
              <Link
                key={item.key}
                href={href}
                prefetch
                className={`inline-flex min-h-[40px] items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  active
                    ? "border-cyan-200 bg-cyan-50 text-cyan-900"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <span className="text-lg leading-none" aria-hidden>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

