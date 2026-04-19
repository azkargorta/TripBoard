"use client";

import Link from "next/link";
import Image from "next/image";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useState } from "react";
import { Menu, User, X } from "lucide-react";
import TripScreenActions from "@/components/trip/common/TripScreenActions";
import SignOutButton from "@/components/auth/SignOutButton";
import {
  mobileMenuSectionTitle,
  mobileMenuRowBase,
  mobileMenuRowIconWrap,
  mobileMenuRowViolet,
  mobileMenuRowVioletIcon,
  mobileMenuRowSignOut,
} from "@/components/ui/mobileMenuStyles";

type Props = {
  tripId: string;
  isPremium?: boolean;
};

const NAV_ITEMS: Array<{
  key: string;
  label: string;
  icon: { type: "emoji"; value: string } | { type: "image"; src: string; alt: string };
  href: (id: string) => string;
}> = [
  {
    key: "summary",
    label: "Resumen",
    icon: { type: "image", src: "/brand/tabs/calendar.png", alt: "Resumen" },
    href: (id) => `/trip/${id}/summary`,
  },
  { key: "plan", label: "Plan", icon: { type: "image", src: "/brand/tabs/plan.png", alt: "Plan" }, href: (id) => `/trip/${id}/plan` },
  { key: "map", label: "Rutas", icon: { type: "image", src: "/brand/tabs/map.png", alt: "Rutas" }, href: (id) => `/trip/${id}/map` },
  { key: "expenses", label: "Gastos", icon: { type: "image", src: "/brand/tabs/expenses.png", alt: "Gastos" }, href: (id) => `/trip/${id}/expenses` },
  { key: "participants", label: "Gente", icon: { type: "image", src: "/brand/tabs/participants.png", alt: "Participantes" }, href: (id) => `/trip/${id}/participants` },
  { key: "resources", label: "Docs", icon: { type: "image", src: "/brand/tabs/documents.png", alt: "Docs" }, href: (id) => `/trip/${id}/resources` },
  {
    key: "chat",
    label: "Asistente personal",
    icon: { type: "image", src: "/brand/tabs/ai.png", alt: "Asistente personal" },
    href: (id) => `/trip/${id}/ai-chat`,
  },
];

function ItemIcon({
  icon,
}: {
  icon: (typeof NAV_ITEMS)[number]["icon"];
}) {
  if (icon.type === "emoji") {
    return (
      <span className="text-lg leading-none" aria-hidden>
        {icon.value}
      </span>
    );
  }
  return (
    <Image
      src={icon.src}
      alt={icon.alt}
      width={20}
      height={20}
      className="h-5 w-5 object-contain"
    />
  );
}

export default function TripBoardMobileMenu({ tripId, isPremium = true }: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const visibleNavItems = useMemo(() => {
    return isPremium ? NAV_ITEMS : NAV_ITEMS.filter((x) => x.key !== "chat");
  }, [isPremium]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[40px] min-w-[40px] shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60 md:hidden"
        aria-label="Abrir menú"
        title="Menú"
      >
        <Menu className="h-[1.15rem] w-[1.15rem]" strokeWidth={2.25} aria-hidden />
      </button>

      {mounted && open
        ? createPortal(
            <div
              className="fixed inset-0 z-[1150] md:hidden"
              role="dialog"
              aria-modal="true"
              aria-label="Menú del viaje"
            >
              <button
                type="button"
                className="absolute inset-0 bg-slate-900/45 backdrop-blur-[2px]"
                aria-label="Cerrar menú"
                onClick={() => setOpen(false)}
              />

              <div
                className="pointer-events-auto absolute right-0 top-0 h-full w-[min(92vw,420px)] overflow-y-auto border-l border-slate-200/90 bg-gradient-to-b from-white via-white to-slate-50/60 shadow-2xl pb-[max(0.75rem,calc(5.5rem+env(safe-area-inset-bottom,0px)))]"
                style={{
                  paddingTop: "max(env(safe-area-inset-top), 12px)",
                }}
              >
                <div className="flex items-center justify-between gap-3 px-5">
                  <div className="text-xs font-extrabold uppercase tracking-[0.18em] text-slate-500">Menú</div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
                    aria-label="Cerrar"
                  >
                    <X className="h-5 w-5" aria-hidden />
                  </button>
                </div>

                <div className="mt-4 px-5">
                  <div className="rounded-3xl border border-slate-200/80 bg-gradient-to-br from-slate-50/90 via-white to-cyan-50/25 p-4 shadow-sm ring-1 ring-slate-900/[0.04]">
                    <div className={mobileMenuSectionTitle}>Acciones rápidas</div>
                    <div className="mt-3">
                      <TripScreenActions tripId={tripId} showLabels variant="default" menuStack />
                    </div>
                  </div>
                </div>

                <div className="mt-5 px-5">
                  <div className={mobileMenuSectionTitle}>Secciones del viaje</div>
                  <div className="mt-3 space-y-2">
                    {visibleNavItems.map((item) => (
                      <Link
                        key={item.key}
                        href={item.href(tripId)}
                        onClick={() => setOpen(false)}
                        className={`${mobileMenuRowBase} justify-between`}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <span className={mobileMenuRowIconWrap}>
                            <ItemIcon icon={item.icon} />
                          </span>
                          <span className="truncate">{item.label}</span>
                        </span>
                        <span className="shrink-0 text-slate-400" aria-hidden>
                          →
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>

                <div className="mt-6 border-t border-slate-100 px-5 pb-6 pt-5">
                  <div className={mobileMenuSectionTitle}>Cuenta</div>
                  <div className="mt-3 space-y-2">
                    <Link
                      href="/account"
                      onClick={() => setOpen(false)}
                      className={mobileMenuRowViolet}
                    >
                      <span className={mobileMenuRowVioletIcon}>
                        <User className="h-4 w-4" aria-hidden />
                      </span>
                      Cuenta
                    </Link>
                    <SignOutButton showIcon className={mobileMenuRowSignOut} />
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

