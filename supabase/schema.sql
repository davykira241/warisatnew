begin;

create table if not exists public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    email text not null unique,
    role text not null default 'user' check (role in ('user', 'admin')),
    blocked boolean not null default false,
    expires_at timestamptz not null default (now() + interval '1 day'),
    created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (blocked, expires_at) on table public.profiles to authenticated;

create or replace function public.is_warisat_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
    select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false);
$$;

revoke all on function public.is_warisat_admin() from public;
grant execute on function public.is_warisat_admin() to authenticated;

drop policy if exists "profiles_read_own_or_admin" on public.profiles;
create policy "profiles_read_own_or_admin"
    on public.profiles
    for select
    to authenticated
    using (id = (select auth.uid()) or (select public.is_warisat_admin()));

drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update"
    on public.profiles
    for update
    to authenticated
    using ((select public.is_warisat_admin()))
    with check ((select public.is_warisat_admin()));

create or replace function public.create_warisat_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if new.email is not null then
        insert into public.profiles (id, email, role)
        values (
            new.id,
            lower(new.email),
            case when new.raw_app_meta_data ->> 'role' = 'admin' then 'admin' else 'user' end
        )
        on conflict (id) do update
        set email = excluded.email,
            role = excluded.role;
    end if;
    return new;
end;
$$;

revoke all on function public.create_warisat_profile() from public, anon, authenticated;

drop trigger if exists on_warisat_auth_user_created on auth.users;
create trigger on_warisat_auth_user_created
    after insert on auth.users
    for each row execute function public.create_warisat_profile();

drop trigger if exists on_warisat_auth_email_updated on auth.users;
create trigger on_warisat_auth_email_updated
    after update of email on auth.users
    for each row execute function public.create_warisat_profile();

drop trigger if exists on_warisat_auth_metadata_updated on auth.users;
create trigger on_warisat_auth_metadata_updated
    after update of raw_app_meta_data on auth.users
    for each row execute function public.create_warisat_profile();

insert into public.profiles (id, email, role, created_at)
select
    id,
    lower(email),
    case when raw_app_meta_data ->> 'role' = 'admin' then 'admin' else 'user' end,
    created_at
from auth.users
where email is not null
on conflict (id) do update
set email = excluded.email,
    role = excluded.role;

commit;

-- After creating the administrator account, run this separately in the SQL Editor.
-- Replace the email with the administrator account's email, then sign out and back in.
-- update auth.users
-- set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
-- where email = 'ADMIN_EMAIL_HERE';
