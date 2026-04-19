"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, Shield, Tag, User, X } from "lucide-react";
import SignOutButton from "@/components/auth/SignOutButton";
import {
  mobileMenuSectionTitle,
  mobileMenuRowAdmin,
  mobileMenuRowAdminIcon,
  mobileMenuRowPricing,
  mobileMenuRowPricingIcon,
  mobileMenuRowViolet,
  mobileMenuRowVioletIcon,
  mobileMenuRowSignOut,
} from "@/components/ui/mobileMenuStyles";
import { iconSlotFill40 } from "@/components/ui/iconTokens";

type Props = {
  isAdmin: boolean;
  /** Intro (puede incluir <span> en negrita); en móvil se muestra dentro del panel lateral. */
  intro: ReactNode;
};

export default function DashboardPageHeader({ isAdmin, intro }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  function close() {
    setOpen(false);
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200/90 bg-white px-3 py-2 shadow-sm md:rounded-2xl md:px-4 md:py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 md:text-[11px]">Mis viajes</p>
          <h1 className="truncate text-base font-extrabold tracking-tight text-slate-950 md:text-lg">Tus viajes</h1>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-800 transition hover:bg-slate-100 ${iconSlotFill40}`}
          aria-expanded={open}
          aria-controls="dashboard-mobile-drawer"
          aria-label="Abrir menú"
        >
          <Menu aria-hidden />
        </button>
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-[100]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="dashboard-drawer-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/40 backdrop-blur-[1px]"
            aria-label="Cerrar menú"
            onClick={close}
          />
          <aside
            id="dashboard-mobile-drawer"
            className="absolute left-0 top-0 flex h-[100dvh] w-[min(22rem,calc(100vw-2rem))] max-w-full flex-col border-r border-slate-200 bg-white shadow-xl md:w-[min(24rem,42vw)]"
          >
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <h2 id="dashboard-drawer-title" className="min-w-0 truncate text-sm font-extrabold text-slate-950">
                Menú
              </h2>
              <button
                type="button"
                onClick={close}
                className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 ${iconSlotFill40}`}
                aria-label="Cerrar menú"
              >
                <X aria-hidden />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-4">
              <p className="text-sm leading-relaxed text-slate-600">{intro}</p>
            </div>

            <nav
              className="shrink-0 border-t border-slate-100 p-4"
              onClick={(e) => {
                if ((e.target as HTMLElement).closest("a, button")) close();
              }}
            >
              <div className={mobileMenuSectionTitle}>Accesos</div>
              <div className="mt-3 space-y-2">
                {isAdmin ? (
                  <Link href="/dashboard/admin" className={mobileMenuRowAdmin} onClick={close}>
                    <span className={mobileMenuRowAdminIcon}>
                      <Shield aria-hidden />
                    </span>
                    Admin
                  </Link>
                ) : null}
                <Link href="/pricing" className={mobileMenuRowPricing} onClick={close}>
                  <span className={mobileMenuRowPricingIcon}>
                    <Tag aria-hidden />
                  </span>
                  Precios
                </Link>
                <Link href="/account" className={mobileMenuRowViolet} onClick={close}>
                  <span className={mobileMenuRowVioletIcon}>
                    <User aria-hidden />
                  </span>
                  Cuenta
                </Link>
                <SignOutButton showIcon className={mobileMenuRowSignOut} />
              </div>
            </nav>
          </aside>
        </div>
      ) : null}
    </>
  );
}
