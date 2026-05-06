"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { TRIP_TAB_SUMMARY_SRC, tripTabDocsImageClass } from "@/lib/trip-tab-assets";

type Props = {
  tripId: string;
  isPremium: boolean;
};

type NavItem = {
  key: string;
  label: string;
  sublabel?: string;
  iconSrc: string;
  iconClass?: string;
  href: (id: string) => string;
  isPremiumGated?: boolean;
};

const items: NavItem[] = [
  {
    key: "summary",
    label: "Resumen",
    sublabel: "Vista general",
    iconSrc: TRIP_TAB_SUMMARY_SRC,
    href: (id) => `/trip/${id}/summary`,
  },
  {
    key: "plan",
    label: "Plan",
    sublabel: "Itinerario",
    iconSrc: "/brand/tabs/plan.png",
    href: (id) => `/trip/${id}/plan`,
  },
  {
    key: "map",
    label: "Rutas",
    sublabel: "Mapa y navegación",
    iconSrc: "/brand/tabs/map.png",
    href: (id) => `/trip/${id}/map`,
  },
  {
    key: "expenses",
    label: "Gastos",
    sublabel: "Finanzas del grupo",
    iconSrc: "/brand/tabs/expenses.png",
    href: (id) => `/trip/${id}/expenses`,
  },
  {
    key: "participants",
    label: "Gente",
    sublabel: "Participantes",
    iconSrc: "/brand/tabs/participants.png",
    href: (id) => `/trip/${id}/participants`,
  },
  {
    key: "resources",
    label: "Docs",
    sublabel: "Documentos",
    iconSrc: "/brand/tabs/documents.png",
    iconClass: tripTabDocsImageClass,
    href: (id) => `/trip/${id}/resources`,
  },
  {
    key: "chat",
    label: "Asistente IA",
    sublabel: "Premium",
    iconSrc: "/brand/tabs/ai.png",
    href: (id) => `/trip/${id}/ai-chat`,
    isPremiumGated: true,
  },
];

function isActivePath(pathname: string, href: string, key: string) {
  if (pathname === href) return true;
  if (key === "map" && pathname.startsWith(`${href}/`)) return true;
  return false;
}

export default function DesktopTripSidebar({ tripId, isPremium }: Props) {
  const pathname = usePathname();
  const visibleItems = isPremium ? items : items.filter((i) => !i.isPremiumGated);

  return (
    <aside className="hidden md:block w-[200px] lg:w-[224px] shrink-0">
      <div className="sticky top-24 space-y-2">

        {/* Nav card */}
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-[var(--surface-card)] shadow-[var(--shadow-card)]">

          {/* Header strip */}
          <div className="border-b border-[var(--border-default)] px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">Tu viaje</p>
          </div>

          {/* Nav items */}
          <nav aria-label="Navegación del viaje" className="p-1.5 space-y-0.5">
            {visibleItems.map((item) => {
              const href = item.href(tripId);
              const active = isActivePath(pathname, href, item.key);
              const isAI = item.key === "chat";

              return (
                <Link
                  key={item.key}
                  href={href}
                  prefetch
                  title={item.label}
                  className={`
                    group relative flex min-h-[48px] items-center gap-3 rounded-xl px-2.5 py-2
                    transition-all duration-150 ease-out
                    ${active
                      ? isAI
                        ? "bg-[var(--brand)] shadow-md shadow-[var(--brand-light)]"
                        : "bg-gradient-to-r from-slate-900 to-slate-800 shadow-md shadow-slate-300/40"
                      : "hover:bg-[var(--brand-light)] active:bg-[var(--brand-light)]"
                    }
                  `}
                >
                  {/* Active left bar */}
                  {active && (
                    <span
                      className="absolute -left-[1px] top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-white/50"
                      aria-hidden
                    />
                  )}

                  {/* Icon container */}
                  <span
                    className={`
                      relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl
                      transition-transform duration-150 group-hover:scale-105
                      ${active
                        ? "bg-white/15 ring-1 ring-white/20"
                        : isAI
                          ? "bg-[var(--brand-light)] ring-1 ring-[var(--brand-border)]"
                          : "bg-[var(--surface-page)] ring-1 ring-[var(--border-default)] group-hover:bg-[var(--surface-card)] group-hover:shadow-sm"
                      }
                    `}
                    aria-hidden
                  >
                    <Image
                      src={item.iconSrc}
                      alt=""
                      width={28}
                      height={28}
                      className={`h-7 w-7 object-contain ${item.iconClass || ""} ${active ? "brightness-[2] saturate-0" : ""}`}
                    />
                  </span>

                  {/* Label */}
                  <div className="min-w-0 flex-1">
                    <p className={`text-[13px] font-semibold leading-tight truncate ${active ? "text-white" : "text-[var(--text-primary)]"}`}>
                      {item.label}
                    </p>
                    {item.sublabel && !active && (
                      <p className={`text-[10px] leading-none mt-0.5 truncate ${isAI ? "text-[var(--brand)] font-semibold" : "text-slate-400"}`}>
                        {item.sublabel}
                      </p>
                    )}
                  </div>

                  {/* AI sparkle badge */}
                  {isAI && !active && !isPremium && (
                    <span className="shrink-0 rounded-full bg-[var(--brand-light)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--brand)] ring-1 ring-[var(--brand-border)]">
                      PRO
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Premium upsell if not premium */}
        {!isPremium && (
          <Link
            href="/pricing"
            className="group flex items-center gap-2.5 rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-light)] px-3.5 py-3 transition hover:border-violet-300 hover:shadow-sm"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-[var(--brand)] shadow-sm">
              <span className="text-sm">✦</span>
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-[var(--brand-text)] truncate">Activar Premium</p>
              <p className="text-[10px] text-[var(--brand)] truncate">IA + funciones extra</p>
            </div>
          </Link>
        )}
      </div>
    </aside>
  );
}
