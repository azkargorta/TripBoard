"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ensureProfileForOAuthUser } from "@/lib/profile";

export default function AuthListener() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (
        (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") &&
        session?.user?.email
      ) {
        const metadata = session.user.user_metadata ?? {};

        try {
          await ensureProfileForOAuthUser({
            id: session.user.id,
            email: session.user.email,
            full_name:
              metadata.full_name ??
              metadata.name ??
              metadata.user_name ??
              null,
            avatar_url: metadata.avatar_url ?? metadata.picture ?? null,
          });
        } catch (error) {
          console.error("No se pudo asegurar el profile del usuario:", error);
        }

        router.refresh();
      }

      if (event === "SIGNED_OUT") {
        router.refresh();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  return null;
}