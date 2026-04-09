-- Historial de cambios (auditoría) por viaje
-- Guarda acciones: create/update/delete en entidades como expense/activity/route.

create table if not exists public.trip_audit_log (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  entity_type text not null,
  entity_id text not null,
  action text not null check (action in ('create','update','delete')),
  summary text null,
  diff jsonb null,
  actor_user_id uuid null,
  actor_email text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_trip_audit_log_trip_created
  on public.trip_audit_log (trip_id, created_at desc);

create index if not exists idx_trip_audit_log_entity
  on public.trip_audit_log (trip_id, entity_type, entity_id, created_at desc);

alter table public.trip_audit_log enable row level security;

drop policy if exists "trip_audit_log: read if participant" on public.trip_audit_log;
create policy "trip_audit_log: read if participant"
on public.trip_audit_log for select
to authenticated
using (
  exists (
    select 1 from public.trip_participants tp
    where tp.trip_id = trip_audit_log.trip_id
      and tp.user_id = auth.uid()
      and tp.status <> 'removed'
  )
);

-- Inserción solo para participantes con permisos de edición (mismo criterio que gastos/plan).
drop policy if exists "trip_audit_log: insert if editor" on public.trip_audit_log;
create policy "trip_audit_log: insert if editor"
on public.trip_audit_log for insert
to authenticated
with check (
  exists (
    select 1 from public.trip_participants tp
    where tp.trip_id = trip_audit_log.trip_id
      and tp.user_id = auth.uid()
      and tp.status <> 'removed'
      and (tp.role in ('owner','editor') or tp.can_manage_expenses = true or tp.can_manage_plan = true)
  )
);

