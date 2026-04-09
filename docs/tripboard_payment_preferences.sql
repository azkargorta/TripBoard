-- Preferencias/restricciones de métodos de pago por viajero (por viaje)
-- Métodos soportados: bizum, transfer, cash

create table if not exists public.trip_payment_preferences (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  participant_name text not null,
  send_methods text[] not null default array['bizum','transfer','cash'],
  receive_methods text[] not null default array['bizum','transfer','cash'],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_trip_payment_preferences_unique
  on public.trip_payment_preferences (trip_id, participant_name);

-- RLS
alter table public.trip_payment_preferences enable row level security;

drop policy if exists "trip_payment_preferences: read if participant" on public.trip_payment_preferences;
create policy "trip_payment_preferences: read if participant"
on public.trip_payment_preferences for select
to authenticated
using (
  exists (
    select 1 from public.trip_participants tp
    where tp.trip_id = trip_payment_preferences.trip_id
      and tp.user_id = auth.uid()
      and tp.status <> 'removed'
  )
);

drop policy if exists "trip_payment_preferences: write if editor" on public.trip_payment_preferences;
create policy "trip_payment_preferences: write if editor"
on public.trip_payment_preferences for insert
to authenticated
with check (
  exists (
    select 1 from public.trip_participants tp
    where tp.trip_id = trip_payment_preferences.trip_id
      and tp.user_id = auth.uid()
      and tp.status <> 'removed'
      and (tp.role in ('owner','editor') or tp.can_manage_expenses = true)
  )
);

drop policy if exists "trip_payment_preferences: update if editor" on public.trip_payment_preferences;
create policy "trip_payment_preferences: update if editor"
on public.trip_payment_preferences for update
to authenticated
using (
  exists (
    select 1 from public.trip_participants tp
    where tp.trip_id = trip_payment_preferences.trip_id
      and tp.user_id = auth.uid()
      and tp.status <> 'removed'
      and (tp.role in ('owner','editor') or tp.can_manage_expenses = true)
  )
);

