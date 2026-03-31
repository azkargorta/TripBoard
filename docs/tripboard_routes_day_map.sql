alter table public.routes
  add column if not exists origin_activity_id uuid,
  add column if not exists destination_activity_id uuid,
  add column if not exists waypoint_ids uuid[] default '{}',
  add column if not exists travel_mode text default 'DRIVING';

create index if not exists routes_trip_id_route_date_idx
  on public.routes (trip_id, route_date);
