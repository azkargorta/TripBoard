import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getStripe } from "@/lib/stripe";
import { buildUsernameFromEmail } from "@/lib/profile";

export const runtime = "nodejs";

function isActiveStatus(status: string) {
  return status === "active" || status === "trialing";
}

async function ensureProfileExists(admin: ReturnType<typeof createSupabaseAdmin>, userId: string, email?: string | null) {
  const { data: existing, error } = await admin.from("profiles").select("id, username, email").eq("id", userId).maybeSingle();
  if (error && error.code !== "PGRST116") throw error;
  if (existing?.id) return;

  const safeEmail = (email || "").trim().toLowerCase();
  let usernameBase = buildUsernameFromEmail(safeEmail || `user_${userId.slice(0, 8)}@local`);
  let candidate = usernameBase;
  let counter = 0;

  // Garantiza único (mismo criterio que otros flujos).
  // Nota: profiles_username_unique ya existe en tu SQL de trigger.
  while (true) {
    const { data: u } = await admin.from("profiles").select("id").ilike("username", candidate).maybeSingle();
    if (!u) break;
    counter += 1;
    candidate = `${usernameBase.slice(0, Math.max(1, 20 - String(counter).length))}${counter}`;
  }

  await admin.from("profiles").insert({
    id: userId,
    username: candidate,
    email: safeEmail,
    full_name: null,
    avatar_url: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_premium: false,
  });
}

async function setPremiumForUser(admin: ReturnType<typeof createSupabaseAdmin>, userId: string, isPremium: boolean, email?: string | null) {
  await ensureProfileExists(admin, userId, email || null);
  const { data, error } = await admin
    .from("profiles")
    .update({ is_premium: isPremium, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) {
    throw new Error("No se pudo actualizar profiles.is_premium (profile no encontrado).");
  }
}

export async function POST(req: Request) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
  if (!webhookSecret) {
    return NextResponse.json({ error: "Falta STRIPE_WEBHOOK_SECRET." }, { status: 500 });
  }

  const body = await req.text();
  const sig = (await headers()).get("stripe-signature") || "";

  let event: any;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    return NextResponse.json({ error: "Firma inválida." }, { status: 400 });
  }

  const admin = createSupabaseAdmin();

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as any;
      const customer = session.customer as string | null;
      const subscription = session.subscription as string | null;
      const userId = (session.metadata?.supabase_user_id as string | undefined) || null;
      const email =
        (typeof session.customer_details?.email === "string" ? session.customer_details.email : null) ||
        (typeof session.customer_email === "string" ? session.customer_email : null);

      if (userId && customer) {
        await admin.from("billing_customers").upsert({
          user_id: userId,
          stripe_customer_id: customer,
          updated_at: new Date().toISOString(),
        });
      }

      if (userId && subscription) {
        const subRes = await stripe.subscriptions.retrieve(subscription);
        const sub = (subRes as any)?.data ? (subRes as any).data : subRes;
        const priceId = sub?.items?.data?.[0]?.price?.id ?? null;
        await admin.from("billing_subscriptions").upsert({
          user_id: userId,
          stripe_subscription_id: sub.id,
          status: sub.status,
          price_id: priceId,
          current_period_end: sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null,
          cancel_at_period_end: Boolean(sub.cancel_at_period_end),
          updated_at: new Date().toISOString(),
        });

        await setPremiumForUser(admin, userId, isActiveStatus(sub.status), email);
      }
    }

    if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
      const sub = event.data.object as any;
      let userId = (sub.metadata?.supabase_user_id as string | undefined) || null;

      // Fallback robusto: si el subscription no trae metadata, mapeamos por customer -> user.
      if (!userId && sub.customer) {
        const { data: row } = await admin
          .from("billing_customers")
          .select("user_id")
          .eq("stripe_customer_id", String(sub.customer))
          .maybeSingle();
        userId = row?.user_id ? String(row.user_id) : null;
      }

      if (userId) {
        const priceId = sub.items.data?.[0]?.price?.id ?? null;
        await admin.from("billing_subscriptions").upsert({
          user_id: userId,
          stripe_subscription_id: sub.id,
          status: sub.status,
          price_id: priceId,
          current_period_end: sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null,
          cancel_at_period_end: Boolean(sub.cancel_at_period_end),
          updated_at: new Date().toISOString(),
        });
        await setPremiumForUser(admin, userId, isActiveStatus(sub.status), null);
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as any;
      let userId = (sub.metadata?.supabase_user_id as string | undefined) || null;
      if (!userId && sub.customer) {
        const { data: row } = await admin
          .from("billing_customers")
          .select("user_id")
          .eq("stripe_customer_id", String(sub.customer))
          .maybeSingle();
        userId = row?.user_id ? String(row.user_id) : null;
      }
      if (userId) {
        await admin
          .from("billing_subscriptions")
          .update({ status: sub.status, updated_at: new Date().toISOString() })
          .eq("stripe_subscription_id", sub.id);
        await setPremiumForUser(admin, userId, false, null);
      }
    }

    return NextResponse.json({ received: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Webhook error." },
      { status: 500 }
    );
  }
}

