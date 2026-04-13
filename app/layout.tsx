import "./globals.css";
import type { Metadata, Viewport } from "next";
import AuthListener from "@/components/auth/AuthListener";
import AnalyticsRoot from "@/components/analytics/AnalyticsRoot";
import { createClient } from "@/lib/supabase/server";

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
      <body className="bg-slate-50 text-slate-950">
        <AuthListener />
        <AnalyticsRoot />
        {isPremium !== null ? (
          <div className="sticky top-0 z-50 border-b border-slate-200 bg-white/70 backdrop-blur">
            <div className="mx-auto flex max-w-[1200px] items-center justify-end px-6 py-2">
              <div
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${
                  isPremium
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-slate-200 bg-white text-slate-800"
                }`}
                title={isPremium ? "Plan Premium activo" : "Plan gratuito"}
              >
                <span
                  className={`inline-flex h-2.5 w-2.5 rounded-full ${
                    isPremium ? "bg-emerald-500" : "bg-slate-400"
                  }`}
                  aria-hidden
                />
                <span className="uppercase tracking-[0.16em] opacity-70">Versión</span>
                <span className="font-extrabold">{isPremium ? "Premium" : "gratuita"}</span>
              </div>
            </div>
          </div>
        ) : null}
        {children}
      </body>
    </html>
  );
}
