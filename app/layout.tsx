import "./globals.css";
import "leaflet/dist/leaflet.css";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import AuthListener from "@/components/auth/AuthListener";
import AnalyticsRoot from "@/components/analytics/AnalyticsRoot";
import TripBoardLogo from "@/components/brand/TripBoardLogo";
import { ToastProvider } from "@/components/ui/toast";
import { PremiumBadge } from "@/components/layout/PremiumBadge";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {

  return (
    <html lang="es">
      <body className="touch-manipulation bg-slate-50 text-slate-950 antialiased">
        <ToastProvider>
          <AuthListener />
          <AnalyticsRoot />
          <div className="sticky top-0 z-50">
            <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-violet-900">
              <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-3 py-3 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:py-4 sm:pl-6 sm:pr-6">
                <Link
                  href="/dashboard"
                  className="min-w-0 shrink outline-none ring-white/0 transition hover:opacity-90 focus-visible:ring-2 focus-visible:ring-violet-300/70"
                  aria-label="Ir al panel de viajes"
                >
                  <TripBoardLogo
                    variant="light"
                    size="md"
                    withWordmark
                    imageClassName="h-[10rem] max-h-[10rem] sm:h-[11rem] sm:max-h-[11rem]"
                  />
                </Link>
                <PremiumBadge />
              </div>
            </div>
          </div>
          <div className="min-h-0 min-w-0">{children}</div>
        </ToastProvider>
      </body>
    </html>
  );
}
