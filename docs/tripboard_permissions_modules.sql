alter table public.trip_participants
  add column if not exists role text default 'viewer',
  add column if not exists status text default 'active',
  add column if not exists can_manage_trip boolean default false,
  add column if not exists can_manage_participants boolean default false,
  add column if not exists can_manage_expenses boolean default false,
  add column if not exists can_manage_plan boolean default false,
  add column if not exists can_manage_map boolean default false,
  add column if not exists can_manage_resources boolean default false,
  add column if not exists linked_at timestamptz;

update public.trip_participants
set
  role = case
    when role in ('owner', 'editor', 'viewer') then role
    when user_id is not null then 'owner'
    else 'viewer'
  end
where role is null or role not in ('owner', 'editor', 'viewer');

update public.trip_participants
set
  can_manage_trip = case when role = 'owner' then true else coalesce(can_manage_trip, false) end,
  can_manage_participants = case when role = 'owner' then true else coalesce(can_manage_participants, false) end,
  can_manage_expenses = case when role in ('owner', 'editor') then true else coalesce(can_manage_expenses, false) end,
  can_manage_plan = case when role in ('owner', 'editor') then true else coalesce(can_manage_plan, false) end,
  can_manage_map = case when role in ('owner', 'editor') then true else coalesce(can_manage_map, false) end,
  can_manage_resources = case when role in ('owner', 'editor') then true else coalesce(can_manage_resources, false) end
where true;
