-- Listas colaborativas por viaje (maleta, compra, documentos, etc.)
-- Tablas:
-- - trip_lists: cabecera de lista
-- - trip_list_items: elementos de la lista

create table if not exists public.trip_lists (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  title text not null,
  visibility text not null default 'shared' check (visibility in ('private','shared')),
  editable_by_all boolean not null default false,
  owner_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_trip_lists_trip_id_updated
  on public.trip_lists (trip_id, updated_at desc);

create index if not exists idx_trip_lists_trip_id_owner
  on public.trip_lists (trip_id, owner_user_id);

create table if not exists public.trip_list_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  list_id uuid not null references public.trip_lists(id) on delete cascade,
  text text not null,
  qty numeric(12,2),
  note text,
  is_done boolean not null default false,
  position int not null default 0,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_trip_list_items_list_position
  on public.trip_list_items (list_id, position asc, created_at asc);

create index if not exists idx_trip_list_items_trip_id
  on public.trip_list_items (trip_id);

-- updated_at triggers
create or replace function public.set_updated_at_trip_lists()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_trip_lists_updated_at on public.trip_lists;
create trigger trg_trip_lists_updated_at
before update on public.trip_lists
for each row
execute function public.set_updated_at_trip_lists();

create or replace function public.set_updated_at_trip_list_items()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_trip_list_items_updated_at on public.trip_list_items;
create trigger trg_trip_list_items_updated_at
before update on public.trip_list_items
for each row
execute function public.set_updated_at_trip_list_items();

-- RLS
alter table public.trip_lists enable row level security;
alter table public.trip_list_items enable row level security;

-- Helpers inline: participante activo en el viaje
-- Nota: Usamos subqueries para que funcione con RLS.

-- trip_lists: read
drop policy if exists "trip_lists: read shared or own private" on public.trip_lists;
create policy "trip_lists: read shared or own private"
on public.trip_lists for select
to authenticated
using (
  exists (
    select 1 from public.trip_participants tp
    where tp.trip_id = trip_lists.trip_id
      and tp.user_id = auth.uid()
      and tp.status <> 'removed'
  )
  and (
    trip_lists.visibility = 'shared'
    or trip_lists.owner_user_id = auth.uid()
  )
);

-- trip_lists: insert (solo creador; debe ser participante)
drop policy if exists "trip_lists: insert if participant" on public.trip_lists;
create policy "trip_lists: insert if participant"
on public.trip_lists for insert
to authenticated
with check (
  owner_user_id = auth.uid()
  and exists (
    select 1 from public.trip_participants tp
    where tp.trip_id = trip_lists.trip_id
      and tp.user_id = auth.uid()
      and tp.status <> 'removed'
  )
);

-- trip_lists: update/delete (solo owner de la lista)
drop policy if exists "trip_lists: update if owner" on public.trip_lists;
create policy "trip_lists: update if owner"
on public.trip_lists for update
to authenticated
using (owner_user_id = auth.uid())
with check (owner_user_id = auth.uid());

drop policy if exists "trip_lists: delete if owner" on public.trip_lists;
create policy "trip_lists: delete if owner"
on public.trip_lists for delete
to authenticated
using (owner_user_id = auth.uid());

-- trip_list_items: read (si ves la lista, ves sus items)
drop policy if exists "trip_list_items: read if can read list" on public.trip_list_items;
create policy "trip_list_items: read if can read list"
on public.trip_list_items for select
to authenticated
using (
  exists (
    select 1
    from public.trip_lists l
    where l.id = trip_list_items.list_id
      and l.trip_id = trip_list_items.trip_id
      and exists (
        select 1 from public.trip_participants tp
        where tp.trip_id = l.trip_id
          and tp.user_id = auth.uid()
          and tp.status <> 'removed'
      )
      and (
        l.visibility = 'shared'
        or l.owner_user_id = auth.uid()
      )
  )
);

-- trip_list_items: insert/update/delete
-- Reglas:
-- - lista privada: solo owner de la lista
-- - lista shared:
--   - editable_by_all=true: cualquier participante activo
--   - editable_by_all=false: solo owner/editor

drop policy if exists "trip_list_items: write if allowed by list" on public.trip_list_items;
create policy "trip_list_items: write if allowed by list"
on public.trip_list_items for all
to authenticated
using (
  exists (
    select 1
    from public.trip_lists l
    join public.trip_participants tp
      on tp.trip_id = l.trip_id
     and tp.user_id = auth.uid()
     and tp.status <> 'removed'
    where l.id = trip_list_items.list_id
      and l.trip_id = trip_list_items.trip_id
      and (
        (l.visibility = 'private' and l.owner_user_id = auth.uid())
        or
        (l.visibility = 'shared' and (
          l.editable_by_all = true
          or tp.role in ('owner','editor')
        ))
      )
  )
)
with check (
  exists (
    select 1
    from public.trip_lists l
    join public.trip_participants tp
      on tp.trip_id = l.trip_id
     and tp.user_id = auth.uid()
     and tp.status <> 'removed'
    where l.id = trip_list_items.list_id
      and l.trip_id = trip_list_items.trip_id
      and (
        (l.visibility = 'private' and l.owner_user_id = auth.uid())
        or
        (l.visibility = 'shared' and (
          l.editable_by_all = true
          or tp.role in ('owner','editor')
        ))
      )
  )
);

