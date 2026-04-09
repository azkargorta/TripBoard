-- Restricciones/preferencias de pagos entre personas (por viaje)
-- Permite: bloquear A->B o marcar A->B como preferido.

create table if not exists public.trip_payment_pair_rules (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  from_participant_name text not null,
  to_participant_name text not null,
  allowed boolean not null default true,
  prefer boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_trip_payment_pair_rules_unique
  on public.trip_payment_pair_rules (trip_id, from_participant_name, to_participant_name);

alter table public.trip_payment_pair_rules enable row level security;

drop policy if exists "trip_payment_pair_rules: read if participant" on public.trip_payment_pair_rules;
create policy "trip_payment_pair_rules: read if participant"
on public.trip_payment_pair_rules for select
to authenticated
using (
  exists (
    select 1 from public.trip_participants tp
    where tp.trip_id = trip_payment_pair_rules.trip_id
      and tp.user_id = auth.uid()
      and tp.status <> 'removed'
  )
);

drop policy if exists "trip_payment_pair_rules: upsert if editor" on public.trip_payment_pair_rules;
create policy "trip_payment_pair_rules: upsert if editor"
on public.trip_payment_pair_rules for insert
to authenticated
with check (
  exists (
    select 1 from public.trip_participants tp
    where tp.trip_id = trip_payment_pair_rules.trip_id
      and tp.user_id = auth.uid()
      and tp.status <> 'removed'
      and (tp.role in ('owner','editor') or tp.can_manage_expenses = true)
  )
);

drop policy if exists "trip_payment_pair_rules: update if editor" on public.trip_payment_pair_rules;
create policy "trip_payment_pair_rules: update if editor"
on public.trip_payment_pair_rules for update
to authenticated
using (
  exists (
    select 1 from public.trip_participants tp
    where tp.trip_id = trip_payment_pair_rules.trip_id
      and tp.user_id = auth.uid()
      and tp.status <> 'removed'
      and (tp.role in ('owner','editor') or tp.can_manage_expenses = true)
  )
);

