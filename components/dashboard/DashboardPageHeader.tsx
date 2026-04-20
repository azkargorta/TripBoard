"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Menu, Shield, Tag, User } from "lucide-react";
import SignOutButton from "@/components/auth/SignOutButton";
import { iconInline16 } from "@/components/ui/iconTokens";

type Props = {
  isAdmin: boolean;
};

export default function DashboardPageHeader({ isAdmin }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const el = rootRef.current;
      if (!el || el.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
    };
  }, [open]);

  const dropItem =
    "flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-900 transition hover:bg-slate-50";

  return (
    <div ref={rootRef} className="relative -mt-4 pb-0.5 md:-mt-5 md:pb-1">
      {/* Perfil: esquina superior derecha, sin descentrar el bloque marca + título */}
      <div className="absolute right-0 top-0 z-10 sm:top-0.5">
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm ring-1 ring-slate-900/[0.04] transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60"
            aria-expanded={open}
            aria-haspopup="menu"
            aria-controls="dashboard-account-menu"
            aria-label="Cuenta y accesos"
          >
            <Menu className="h-6 w-6" strokeWidth={2.25} aria-hidden />
          </button>

          {open ? (
            <div
              id="dashboard-account-menu"
              role="menu"
              className="absolute right-0 top-[calc(100%+0.35rem)] z-[100] w-max min-w-[13.5rem] max-w-[min(calc(100vw-1.5rem),17rem)] rounded-2xl border border-slate-200/90 bg-white py-1.5 shadow-xl ring-1 ring-slate-900/[0.06]"
            >
              <div className="px-1.5" onClick={() => setOpen(false)}>
                {isAdmin ? (
                  <Link href="/dashboard/admin" role="menuitem" className={`${dropItem} text-amber-950`}>
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-amber-700 text-white shadow-sm">
                      <Shield className={iconInline16} aria-hidden />
                    </span>
                    Admin
                  </Link>
                ) : null}
                <Link href="/pricing" role="menuitem" className={dropItem}>
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-sm">
                    <Tag className={iconInline16} aria-hidden />
                  </span>
                  Precios
                </Link>
                <Link href="/account" role="menuitem" className={dropItem}>
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-sm">
                    <User className={iconInline16} aria-hidden />
                  </span>
                  Cuenta
                </Link>
                <SignOutButton
                  showIcon
                  iconSlotClassName="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-slate-700 to-slate-900 text-white shadow-sm"
                  iconClassName={`${iconInline16} text-white opacity-95`}
                  className={`${dropItem} border-0 bg-transparent text-slate-900 shadow-none ring-0 hover:bg-slate-50`}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
