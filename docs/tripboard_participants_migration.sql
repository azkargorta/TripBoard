-- Ejecuta esto solo si estas columnas aún no existen.
-- Ajusta nombres/tipos si en tu proyecto ya creaste alguna variante previa.

alter table public.trip_participants
  add column if not exists email text,
  add column if not exists role text not null default 'viewer',
  add column if not exists status text not null default 'pending',
  add column if not exists can_manage_trip boolean not null default false,
  add column if not exists can_manage_participants boolean not null default false,
  add column if not exists can_manage_expenses boolean not null default false,
  add column if not exists can_manage_plan boolean not null default false,
  add column if not exists can_manage_map boolean not null default false,
  add column if not exists can_manage_resources boolean not null default false,
  add column if not exists linked_at timestamptz;

alter table public.trip_participants
  drop constraint if exists trip_participants_role_check,
  drop constraint if exists trip_participants_status_check;

alter table public.trip_participants
  add constraint trip_participants_role_check
    check (role in ('owner', 'editor', 'viewer')),
  add constraint trip_participants_status_check
    check (status in ('active', 'pending', 'removed'));

alter table public.trip_invites
  add column if not exists participant_id uuid references public.trip_participants(id) on delete set null,
  add column if not exists display_name text,
  add column if not exists email text,
  add column if not exists role text not null default 'viewer',
  add column if not exists status text not null default 'pending',
  add column if not exists whatsapp_message text,
  add column if not exists created_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists accepted_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists accepted_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists can_manage_trip boolean not null default false,
  add column if not exists can_manage_participants boolean not null default false,
  add column if not exists can_manage_expenses boolean not null default false,
  add column if not exists can_manage_plan boolean not null default false,
  add column if not exists can_manage_map boolean not null default false,
  add column if not exists can_manage_resources boolean not null default false;

create index if not exists idx_trip_participants_trip_id_status
  on public.trip_participants (trip_id, status);

create unique index if not exists idx_trip_invites_token_unique
  on public.trip_invites (token);
