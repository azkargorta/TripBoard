-- Premium plan (simple flag) + helpers for free-tier restrictions.
--
-- Objetivo:
-- - `profiles.is_premium` controla el acceso a IA, Maps/autocomplete, geocoding, etc.
-- - Sin premium: 1 viaje activo (en la app se aplica como "solo el último viaje creado").
--
-- Nota: RLS de profiles depende de tu proyecto; aquí solo añadimos la columna.

alter table public.profiles
  add column if not exists is_premium boolean not null default false;

create index if not exists profiles_is_premium_idx on public.profiles (is_premium);

