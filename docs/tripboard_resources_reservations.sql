create table if not exists public.trip_resources (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  title text not null,
  resource_type text not null default 'document',
  category text,
  notes text,
  file_path text,
  file_url text,
  mime_type text,
  status text default 'active',
  detected_document_type text,
  detected_data jsonb default '{}'::jsonb,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trip_resources_trip_id_idx
  on public.trip_resources(trip_id);

create table if not exists public.trip_reservations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  resource_id uuid references public.trip_resources(id) on delete set null,
  reservation_type text not null default 'lodging',
  provider_name text,
  reservation_name text not null,
  reservation_code text,
  address text,
  city text,
  country text,
  check_in_date date,
  check_in_time text,
  check_out_date date,
  check_out_time text,
  nights integer,
  guests integer,
  total_amount numeric(12,2),
  currency text default 'EUR',
  payment_status text not null default 'pending',
  is_paid boolean generated always as (payment_status = 'paid') stored,
  notes text,
  status text not null default 'active',
  detected_document_type text,
  detected_data jsonb default '{}'::jsonb,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trip_reservations_trip_id_idx
  on public.trip_reservations(trip_id);

alter table public.trip_resources
  add column if not exists linked_reservation_id uuid references public.trip_reservations(id) on delete set null;

create or replace function public.set_updated_at_trip_resources()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_trip_resources_updated_at on public.trip_resources;
create trigger trg_trip_resources_updated_at
before update on public.trip_resources
for each row
execute function public.set_updated_at_trip_resources();

create or replace function public.set_updated_at_trip_reservations()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_trip_reservations_updated_at on public.trip_reservations;
create trigger trg_trip_reservations_updated_at
before update on public.trip_reservations
for each row
execute function public.set_updated_at_trip_reservations();
