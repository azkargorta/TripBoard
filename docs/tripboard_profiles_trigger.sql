-- Profiles: enforce unique username and auto-create profile on signup.
-- This makes username truly usable for invites/search across the app.

-- 1) Ensure username is unique (case-insensitive if you always store lowercase).
-- If you already have duplicates, you'll need to fix them before adding this constraint.
create unique index if not exists profiles_username_unique on public.profiles (username);

-- 2) Auto-create a profile row for every new auth user.
-- Uses auth.users.raw_user_meta_data->>'username' when provided (email signup uses options.data.username).
-- Falls back to local-part of email.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  desired_username text;
  base text;
  candidate text;
  counter int := 0;
begin
  desired_username := lower(coalesce(new.raw_user_meta_data->>'username', ''));

  if desired_username is null or desired_username = '' then
    base := lower(split_part(coalesce(new.email, 'user'), '@', 1));
    -- normalize similar to app: keep [a-z0-9_], max 20
    base := regexp_replace(base, '[^a-z0-9_]', '_', 'g');
    base := regexp_replace(base, '_+', '_', 'g');
    base := left(base, 20);
    if base = '' then
      base := 'user';
    end if;
    desired_username := base;
  else
    desired_username := regexp_replace(desired_username, '[^a-z0-9_]', '_', 'g');
    desired_username := regexp_replace(desired_username, '_+', '_', 'g');
    desired_username := left(desired_username, 20);
    if length(desired_username) < 3 then
      desired_username := lpad(desired_username, 3, 'u');
    end if;
  end if;

  candidate := desired_username;
  while exists (select 1 from public.profiles p where p.username = candidate) loop
    counter := counter + 1;
    candidate := left(desired_username, greatest(1, 20 - length(counter::text))) || counter::text;
  end loop;

  insert into public.profiles (id, username, email, full_name, avatar_url, created_at, updated_at)
  values (new.id, candidate, lower(coalesce(new.email, '')), null, null, now(), now())
  on conflict (id) do update
    set username = excluded.username,
        email = excluded.email,
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

