"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import TripBoardLogo from "@/components/brand/TripBoardLogo";
import { PremiumBadge } from "@/components/layout/PremiumBadge";
import DarkModeToggle from "@/components/ui/DarkModeToggle";

export default function RootTopBar() {
  const pathname = usePathname();

  // En la landing pública, el header lo gestiona `components/PublicLanding.tsx`.
  if (pathname === "/") return null;

  return (
    <div className="sticky top-0 z-50">
      <div className="root-header bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 dark:from-[#080C14] dark:via-[#0F1623] dark:to-[#080C14]">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-3 py-3 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:py-4 sm:pl-6 sm:pr-6">
          <Link
            href="/dashboard"
            className="min-w-0 shrink outline-none ring-white/0 transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-violet-300/70"
            aria-label="Ir al panel de viajes"
          >
            <TripBoardLogo variant="light" size="md" withWordmark imageClassName="h-8 max-h-8 sm:h-9 sm:max-h-9" />
          </Link>
          <div className="flex items-center gap-2">
            <PremiumBadge />
            <DarkModeToggle />
          </div>
        </div>
      </div>
    </div>
  );
}

