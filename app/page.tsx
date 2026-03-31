import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/auth/login");
    }

    redirect("/dashboard");
  } catch (error) {
    console.error("HomePage error:", error);

    return (
      <main style={{ padding: 24 }}>
        <h1>TripBoard funcionando</h1>
        <p>No se pudo comprobar la sesión, pero la app está desplegada.</p>
      </main>
    );
  }
}