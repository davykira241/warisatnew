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

create or replace function public.set_warisat_user_blocked(p_email text, p_blocked boolean)
returns table (id uuid, email text, blocked boolean, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
    if p_email is null or btrim(p_email) = '' or p_blocked is null then
        raise exception 'A valid email and block status are required.' using errcode = '22023';
    end if;

    update public.profiles as profile
    set blocked = p_blocked
    where lower(profile.email) = lower(btrim(p_email))
    returning profile.id, profile.email, profile.blocked, profile.expires_at
    into id, email, blocked, expires_at;

    if not found then
        raise exception 'User profile not found.' using errcode = 'P0002';
    end if;

    return next;
end;
$$;

create or replace function public.renew_warisat_subscription(p_email text, p_days integer)
returns table (id uuid, email text, blocked boolean, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
    if p_email is null or btrim(p_email) = '' then
        raise exception 'A valid email is required.' using errcode = '22023';
    end if;
    if p_days is null or p_days not in (1, 3, 7, 30, 60, 365) then
        raise exception 'Subscription duration must be 1, 3, 7, 30, 60, or 365 days.' using errcode = '22023';
    end if;

    update public.profiles as profile
    set expires_at = greatest(profile.expires_at, pg_catalog.now())
            + pg_catalog.make_interval(days => p_days),
        blocked = false
    where lower(profile.email) = lower(btrim(p_email))
    returning profile.id, profile.email, profile.blocked, profile.expires_at
    into id, email, blocked, expires_at;

    if not found then
        raise exception 'User profile not found.' using errcode = 'P0002';
    end if;

    return next;
end;
$$;

revoke all on function public.set_warisat_user_blocked(text, boolean) from public, anon, authenticated;
revoke all on function public.renew_warisat_subscription(text, integer) from public, anon, authenticated;
grant execute on function public.set_warisat_user_blocked(text, boolean) to postgres, service_role;
grant execute on function public.renew_warisat_subscription(text, integer) to postgres, service_role;

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
