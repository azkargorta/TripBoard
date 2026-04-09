-- AI usage tracking and per-user monthly budget enforcement helpers.
-- This is intended for Gemini (token-based billing), but can track any provider.

create table if not exists public.user_ai_usage_monthly (
  user_id uuid not null references auth.users (id) on delete cascade,
  month_key text not null, -- format: YYYY-MM (UTC)
  provider text not null default 'gemini',
  model text null,
  requests_count integer not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  estimated_cost_eur numeric(12, 6) not null default 0,
  last_request_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, month_key, provider)
);

alter table public.user_ai_usage_monthly enable row level security;

-- Users can read only their own usage.
drop policy if exists "user_ai_usage_monthly_select_own" on public.user_ai_usage_monthly;
create policy "user_ai_usage_monthly_select_own"
on public.user_ai_usage_monthly
for select
to authenticated
using (auth.uid() = user_id);

-- Users can upsert their own usage rows (server will do this with the session).
drop policy if exists "user_ai_usage_monthly_upsert_own" on public.user_ai_usage_monthly;
create policy "user_ai_usage_monthly_upsert_own"
on public.user_ai_usage_monthly
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "user_ai_usage_monthly_update_own" on public.user_ai_usage_monthly;
create policy "user_ai_usage_monthly_update_own"
on public.user_ai_usage_monthly
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Optional: keep updated_at fresh.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_user_ai_usage_monthly_updated_at on public.user_ai_usage_monthly;
create trigger set_user_ai_usage_monthly_updated_at
before update on public.user_ai_usage_monthly
for each row execute function public.set_updated_at();

