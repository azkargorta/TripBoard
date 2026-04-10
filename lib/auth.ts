import { supabase } from "@/lib/supabase";
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

  let data: any = null;
  let error: any = null;
  try {
    const result = await withTimeout(
      supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectTo,
          data: {
            username,
          },
        },
      }),
      45_000,
      "Supabase tardó demasiado en crear tu cuenta. Puede que se haya creado igualmente: intenta iniciar sesión."
    );
    data = result.data;
    error = result.error;
  } catch (e) {
    // Si el signup tarda mucho, a veces Supabase termina creando el usuario aunque el cliente haya timeouteado.
    // En ese caso, probamos a iniciar sesión para confirmar.
    const raw = e instanceof Error ? e.message : String(e);
    try {
      const signIn = await withTimeout(
        supabase.auth.signInWithPassword({ email, password }),
        12_000,
        raw
      );
      return signIn;
    } catch {
      throw new Error(raw);
    }
  }

  if (error) {
    throw error;
  }

  // El profile lo crea el trigger server-side (ver docs/tripboard_profiles_trigger.sql).

  return data;
}

/**
 * Login con email + password
 */
export async function signInWithEmail(params: {
  email: string;
  password: string;
}) {
  const email = params.email.trim().toLowerCase();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: params.password,
  });

  if (error) throw error;

  return data;
}

/**
 * Login con Google
 */
export async function signInWithGoogle(next: string = "/dashboard") {
  const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
    next
  )}`;

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
    },
  });

  if (error) throw error;

  return data;
}

/**
 * Enviar email de recuperación de contraseña
 */
export async function sendPasswordReset(email: string) {
  const redirectTo = `${window.location.origin}/auth/reset-password`;

  const { error } = await supabase.auth.resetPasswordForEmail(
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

  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  });

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