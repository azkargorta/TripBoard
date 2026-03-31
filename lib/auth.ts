import { supabase } from "@/lib/supabase";
import {
  isValidEmail,
  isValidPassword,
  isValidUsername,
  normalizeUsername,
} from "@/lib/validators/auth";
import { isUsernameAvailable, upsertProfile } from "@/lib/profile";

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

  const available = await isUsernameAvailable(username);
  if (!available) {
    throw new Error("Ese nombre de usuario ya está en uso");
  }

  const redirectTo = `${window.location.origin}/auth/callback`;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirectTo,
      data: {
        username,
      },
    },
  });

  if (error) {
    throw error;
  }

  // Crear profile
  if (data.user) {
    try {
      await upsertProfile({
        id: data.user.id,
        username,
        email,
        full_name: null,
        avatar_url: null,
      });
    } catch (profileError) {
      console.error("Error creando profile tras signup:", profileError);
    }
  }

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