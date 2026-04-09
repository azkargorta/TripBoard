-- Bucket + políticas para adjuntos de gastos (Supabase Storage)
-- Objetivo: permitir subir/leer/borrar adjuntos en `trip-expenses/<tripId>/...`
-- Requisito: el usuario debe ser participante del viaje (trip_participants) y no estar removed.

-- 1) Crear bucket si no existe
insert into storage.buckets (id, name, public)
values ('trip-expenses', 'trip-expenses', false)
on conflict (id) do nothing;

-- 2) Políticas RLS para storage.objects
-- Nota: estas políticas usan la convención de path: "<tripId>/<filename>"
-- y verifican el acceso mirando trip_participants.

-- Lectura: cualquier participante del viaje puede leer
drop policy if exists "trip-expenses: read if participant" on storage.objects;
create policy "trip-expenses: read if participant"
on storage.objects for select
to authenticated
using (
  bucket_id = 'trip-expenses'
  and exists (
    select 1
    from public.trip_participants tp
    where tp.trip_id = split_part(name, '/', 1)::uuid
      and tp.user_id = auth.uid()
      and tp.status <> 'removed'
  )
);

-- Subida: cualquier participante (no viewer si quieres endurecerlo) puede subir
drop policy if exists "trip-expenses: upload if participant" on storage.objects;
create policy "trip-expenses: upload if participant"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'trip-expenses'
  and exists (
    select 1
    from public.trip_participants tp
    where tp.trip_id = split_part(name, '/', 1)::uuid
      and tp.user_id = auth.uid()
      and tp.status <> 'removed'
  )
);

-- Borrado: owner o can_manage_expenses
drop policy if exists "trip-expenses: delete if expense manager" on storage.objects;
create policy "trip-expenses: delete if expense manager"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'trip-expenses'
  and exists (
    select 1
    from public.trip_participants tp
    where tp.trip_id = split_part(name, '/', 1)::uuid
      and tp.user_id = auth.uid()
      and tp.status <> 'removed'
      and (tp.role = 'owner' or tp.can_manage_expenses = true)
  )
);

