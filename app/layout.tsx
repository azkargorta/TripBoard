import "./globals.css";
import "leaflet/dist/leaflet.css";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import AuthListener from "@/components/auth/AuthListener";
import AnalyticsRoot from "@/components/analytics/AnalyticsRoot";
import TripBoardLogo from "@/components/brand/TripBoardLogo";
import { createClient } from "@/lib/supabase/server";
import { ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: "Kaviro",
  description: "Organiza viajes, gastos y rutas",
  applicationName: "Kaviro",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Kaviro",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let isPremium: boolean | null = null;
  if (user?.id) {
    const { data: profileRow } = await supabase
      .from("profiles")
      .select("is_premium")
      .eq("id", user.id)
      .maybeSingle();
    isPremium = Boolean((profileRow as any)?.is_premium);
  }

  return (
    <html lang="es">
      <body className="touch-manipulation bg-slate-50 text-slate-950 antialiased">
        <ToastProvider>
          <AuthListener />
          <AnalyticsRoot />
          {isPremium !== null ? (
            <div className="sticky top-0 z-50">
              <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-cyan-900">
                <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-3 py-1.5 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:py-2 sm:pl-6 sm:pr-6">
                  <Link
                    href="/dashboard"
                    className="min-w-0 shrink outline-none ring-white/0 transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-cyan-300/70"
                    aria-label="Ir al panel de viajes"
                  >
                    <TripBoardLogo variant="light" size="sm" withWordmark />
                  </Link>
                  <div
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold ${
                      isPremium
                        ? "border-emerald-300/35 bg-emerald-400/15 text-emerald-50"
                        : "border-white/20 bg-white/10 text-white"
                    }`}
                    title={isPremium ? "Versión Premium" : "Versión gratuita"}
                  >
                    <span
                      className={`inline-flex h-2.5 w-2.5 rounded-full ${
                        isPremium ? "bg-emerald-300" : "bg-white/70"
                      }`}
                      aria-hidden
                    />
                    <span className="uppercase tracking-[0.16em] opacity-70">Versión</span>
                    <span className="font-extrabold">{isPremium ? "Premium" : "gratuita"}</span>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
          <div className="min-h-0 min-w-0">{children}</div>
        </ToastProvider>
      </body>
    </html>
  );
}
