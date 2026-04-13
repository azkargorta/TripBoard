-- Stripe billing tables (minimal).
-- Guarda relación user <-> customer/subscription y nos permite derivar profiles.is_premium.

create table if not exists public.billing_customers (
  user_id uuid not null primary key references auth.users (id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  stripe_subscription_id text not null unique,
  status text not null,
  price_id text null,
  current_period_end timestamptz null,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists billing_subscriptions_user_id_idx on public.billing_subscriptions (user_id);

alter table public.billing_customers enable row level security;
alter table public.billing_subscriptions enable row level security;
-- Sin policies: solo server/service role.

