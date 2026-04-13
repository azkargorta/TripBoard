import Stripe from "stripe";

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY || "";
  if (!key) throw new Error("Falta STRIPE_SECRET_KEY.");
  // En versiones recientes del SDK el tipo de apiVersion es literal; omitimos para evitar mismatch.
  return new Stripe(key);
}

export function getAppUrl() {
  const url = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "";
  if (url) return url.replace(/\/+$/, "");
  // fallback razonable si no se configura (en dev suele existir)
  return "";
}

