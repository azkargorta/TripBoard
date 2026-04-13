import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

function isActiveStatus(status: string) {
  return status === "active" || status === "trialing";
}

async function setPremiumForUser(userId: string, isPremium: boolean) {
  const admin = createSupabaseAdmin();
  await admin.from("profiles").update({ is_premium: isPremium }).eq("id", userId);
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
      const userId = session.metadata?.supabase_user_id as string | undefined;

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

        await setPremiumForUser(userId, isActiveStatus(sub.status));
      }
    }

    if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated") {
      const sub = event.data.object as any;
      const userId = (sub.metadata?.supabase_user_id as string | undefined) || null;

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
        await setPremiumForUser(userId, isActiveStatus(sub.status));
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as any;
      const userId = (sub.metadata?.supabase_user_id as string | undefined) || null;
      if (userId) {
        await admin
          .from("billing_subscriptions")
          .update({ status: sub.status, updated_at: new Date().toISOString() })
          .eq("stripe_subscription_id", sub.id);
        await setPremiumForUser(userId, false);
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

