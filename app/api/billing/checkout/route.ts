import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";
export const maxDuration = 30;

function getPriceId(plan: "monthly" | "yearly") {
  const id =
    plan === "yearly"
      ? process.env.STRIPE_PRICE_ID_YEARLY
      : process.env.STRIPE_PRICE_ID_MONTHLY;
  if (!id) throw new Error(`Falta STRIPE_PRICE_ID_${plan === "yearly" ? "YEARLY" : "MONTHLY"}.`);
  return id;
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError) return NextResponse.json({ error: userError.message }, { status: 401 });
    if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });

    const body = await req.json().catch(() => null);
    const plan = (body?.plan === "yearly" ? "yearly" : "monthly") as "monthly" | "yearly";
    const priceId = getPriceId(plan);

    const stripe = getStripe();
    const admin = createSupabaseAdmin();

    const { data: customerRow } = await admin
      .from("billing_customers")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const email = user.email || undefined;

    const customerId =
      typeof (customerRow as any)?.stripe_customer_id === "string"
        ? String((customerRow as any).stripe_customer_id)
        : null;

    const customer =
      customerId ||
      (
        await stripe.customers.create({
          email,
          metadata: { supabase_user_id: user.id },
        })
      ).id;

    if (!customerId) {
      await admin.from("billing_customers").upsert({
        user_id: user.id,
        stripe_customer_id: customer,
        updated_at: new Date().toISOString(),
      });
    }

    const origin = new URL(req.url).origin;
    const success_url = `${origin}/account?billing=success`;
    const cancel_url = `${origin}/account?billing=cancel`;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      success_url,
      cancel_url,
      subscription_data: {
        metadata: { supabase_user_id: user.id },
      },
      metadata: { supabase_user_id: user.id, plan },
    });

    return NextResponse.json({ url: session.url }, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo iniciar el checkout." },
      { status: 500 }
    );
  }
}

