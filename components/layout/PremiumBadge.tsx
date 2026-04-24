"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function PremiumBadge() {
  const [isPremium, setIsPremium] = useState<boolean | null>(null);

  useEffect(() => {
    const fetchPremiumStatus = async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user?.id) {
          setIsPremium(false);
          return;
        }

        const { data: profileRow } = await supabase
          .from("profiles")
          .select("is_premium")
          .eq("id", user.id)
          .maybeSingle();

        setIsPremium(Boolean((profileRow as any)?.is_premium));
      } catch (error) {
        console.error("Error fetching premium status:", error);
        setIsPremium(false);
      }
    };

    fetchPremiumStatus();
  }, []);

  if (isPremium === null) {
    return null;
  }

  return (
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
  );
}
