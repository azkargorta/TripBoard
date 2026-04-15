-- Premium plan (simple flag) + helpers for free-tier restrictions.
--
-- Objetivo:
-- - `profiles.is_premium` controla el acceso a IA, Maps/autocomplete, geocoding, etc.
-- - Sin premium: hasta 3 viajes activos (en la app se aplica como "los 3 últimos viajes creados").
--
-- Nota: RLS de profiles depende de tu proyecto; aquí solo añadimos la columna.

alter table public.profiles
  add column if not exists is_premium boolean not null default false;

create index if not exists profiles_is_premium_idx on public.profiles (is_premium);

