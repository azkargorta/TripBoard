import "./globals.css";
import type { Metadata, Viewport } from "next";
import AuthListener from "@/components/auth/AuthListener";
import AnalyticsRoot from "@/components/analytics/AnalyticsRoot";

export const metadata: Metadata = {
  title: "TripBoard",
  description: "Organiza viajes, gastos y rutas",
  applicationName: "TripBoard",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "TripBoard",
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
      <body className="bg-slate-50 text-slate-950">
        <AuthListener />
        <AnalyticsRoot />
        {children}
      </body>
    </html>
  );
}
