-- Plataforma: administradores globales y registro de visitas (páginas).
-- 1) Añade tu usuario como admin (sustituye el UUID por el de auth.users):
--    insert into public.platform_admins (user_id) values ('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx');
-- 2) Opcional: variable de entorno TRIPBOARD_ADMIN_EMAILS=tu@email.com (coma-separado) como respaldo.

create table if not exists public.platform_admins (
  user_id uuid not null primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

-- Nadie lee/escribe desde el cliente; solo service role (API admin) o SQL manual.
-- Sin políticas = acceso denegado para anon/authenticated.

create table if not exists public.site_page_views (
  id uuid not null default gen_random_uuid() primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  path text not null,
  referrer text null,
  user_agent text null,
  created_at timestamptz not null default now()
);

create index if not exists site_page_views_created_at_idx on public.site_page_views (created_at desc);
create index if not exists site_page_views_user_id_idx on public.site_page_views (user_id);
create index if not exists site_page_views_path_idx on public.site_page_views (path);

alter table public.site_page_views enable row level security;

drop policy if exists "site_page_views_insert_own" on public.site_page_views;
create policy "site_page_views_insert_own"
on public.site_page_views
for insert
to authenticated
with check (auth.uid() = user_id);

-- Lectura agregada solo vía service role en /api/admin/*
