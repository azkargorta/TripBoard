import { supabase } from "@/lib/supabase";
import { createClient } from "@/lib/supabase/client";
import { createRecoveryEmailClient } from "@/lib/supabase/recovery-email-client";
import {
  isValidEmail,
  isValidPassword,
  isValidUsername,
  normalizeUsername,
} from "@/lib/validators/auth";
import { isUsernameAvailable } from "@/lib/profile";
import { withTimeout } from "@/lib/with-timeout";

/**
 * Registro con email + password
 */
export async function signUpWithEmail(params: {
  username: string;
  email: string;
  password: string;
}) {
  const username = normalizeUsername(params.username);
  const email = params.email.trim().toLowerCase();
  const password = params.password;

  if (!isValidUsername(username)) {
    throw new Error(
      "El nombre de usuario debe tener entre 3 y 20 caracteres y usar solo letras minúsculas, números o guion bajo"
    );
  }

  if (!isValidEmail(email)) {
    throw new Error("Email no válido");
  }

  if (!isValidPassword(password)) {
    throw new Error("La contraseña debe tener al menos 8 caracteres");
  }

  const available = await withTimeout(
    isUsernameAvailable(username),
    12_000,
    "El servidor tardó demasiado en comprobar el nombre de usuario. Reintenta."
  );
  if (!available) {
    throw new Error("Ese nombre de usuario ya está en uso");
  }

  const redirectTo = `${window.location.origin}/auth/callback`;

  // Registro robusto: hacemos signup server-side para evitar problemas de SMTP/timeouts en cliente.
  const resp = await withTimeout(
    fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username, email, password, redirectTo }),
    }),
    20_000,
    "El servidor tardó demasiado en crear tu cuenta. Reintenta."
  );

  const payload = await resp.json().catch(() => null);
  if (!resp.ok) {
    const msg = payload?.error ? String(payload.error) : `Error ${resp.status}`;
    throw new Error(msg);
  }

  // La sesión se establece server-side en /api/auth/signup (cookies). No hacemos signIn en cliente.
  return payload;
}

/**
 * Login con email + password
 */
export async function signInWithEmail(params: {
  email: string;
  password: string;
}) {
  const email = params.email.trim().toLowerCase();

  const res = await withTimeout(
    fetch("/api/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: params.password }),
    }),
    25_000,
    "El servidor tardó demasiado. Reintenta."
  );

  const payload = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) {
    throw new Error(payload?.error || `Error ${res.status}`);
  }

  return payload;
}

/**
 * Login con Google — el retorno lo gestiona GET /auth/oauth/callback (servidor).
 */
export async function signInWithGoogle(next: string = "/dashboard") {
  const safe = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  const redirectTo = `${window.location.origin}/auth/oauth/callback?next=${encodeURIComponent(safe)}`;

  const { data, error } = await withTimeout(
    supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    }),
    20_000,
    "No se pudo iniciar sesión con Google (tiempo agotado). Revisa la conexión."
  );

  if (error) throw error;
  if (!data?.url) {
    throw new Error("No se pudo obtener la URL de inicio de sesión con Google.");
  }

  window.location.assign(data.url);
}

/**
 * Enviar email de recuperación de contraseña
 */
export async function sendPasswordReset(email: string) {
  // Punto de entrada dedicado: normaliza ?code= → callback y #hash → reset-password.
  // Debe figurar en Supabase → Authentication → URL Configuration → Redirect URLs.
  const redirectTo = `${window.location.origin}/auth/recovery`;

  const recoveryClient = createRecoveryEmailClient();
  const { error } = await recoveryClient.auth.resetPasswordForEmail(
    email.trim().toLowerCase(),
    {
      redirectTo,
    }
  );

  if (error) throw error;
}

/**
 * Actualizar contraseña
 */
export async function updateMyPassword(newPassword: string) {
  if (!isValidPassword(newPassword)) {
    throw new Error("La nueva contraseña debe tener al menos 8 caracteres");
  }

  const client = createClient();
  const {
    data: { session },
  } = await client.auth.getSession();
  if (!session) {
    throw new Error(
      "No hay sesión de recuperación en este navegador. Abre de nuevo el enlace del correo (misma pestaña tras el clic)."
    );
  }

  const { error } = await withTimeout(
    client.auth.updateUser({ password: newPassword }),
    25_000,
    "El servidor tardó demasiado. Comprueba la conexión e inténtalo otra vez."
  );

  if (error) throw error;
}

/**
 * Logout (simple y limpio)
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error("Error en signOut:", error);
    throw error;
  }
}