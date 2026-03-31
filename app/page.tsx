import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Usuario no logeado → login
    if (!user) {
      redirect("/auth/login");
    }

    // Usuario logeado → dashboard
    redirect("/dashboard");

  } catch (error) {
    console.error("HomePage error:", error);

    // Fallback seguro (evita 500)
    return (
      <div style={{ padding: 20 }}>
        TripBoard cargando...
      </div>
    );
  }
}
