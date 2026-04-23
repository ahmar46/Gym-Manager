create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text,
  phone text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.gyms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  phone text,
  owner_id uuid not null references public.profiles(id) on delete restrict,
  whatsapp_provider text not null default 'twilio' check (whatsapp_provider in ('twilio', 'meta')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.gym_memberships (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'trainer', 'reception')),
  created_at timestamptz not null default timezone('utc', now()),
  unique (gym_id, user_id)
);

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  full_name text not null,
  phone text not null,
  goal text,
  joining_date date not null,
  plan text not null check (plan in ('Monthly', 'Quarterly', 'Half-Yearly', 'Annual')),
  fee numeric(12,2) not null default 0,
  payment_status text not null check (payment_status in ('Paid', 'Pending', 'Overdue')),
  last_payment_date date,
  expiry_date date not null,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (gym_id, phone)
);

create table if not exists public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  check_in_at timestamptz not null,
  check_out_at timestamptz,
  duration_minutes integer,
  marked_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.whatsapp_reminders (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  reminder_type text not null check (reminder_type in ('absence', 'fee')),
  reminder_date date not null default current_date,
  provider text not null check (provider in ('twilio', 'meta')),
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  phone text not null,
  message text not null,
  external_id text,
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  unique (gym_id, member_id, reminder_type, reminder_date)
);

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists handle_profiles_updated_at on public.profiles;
create trigger handle_profiles_updated_at
before update on public.profiles
for each row execute function public.handle_updated_at();

drop trigger if exists handle_gyms_updated_at on public.gyms;
create trigger handle_gyms_updated_at
before update on public.gyms
for each row execute function public.handle_updated_at();

drop trigger if exists handle_members_updated_at on public.members;
create trigger handle_members_updated_at
before update on public.members
for each row execute function public.handle_updated_at();

create or replace function public.calculate_expiry(joining_date date, member_plan text)
returns date
language sql
immutable
as $$
  select case member_plan
    when 'Monthly' then joining_date + interval '30 days'
    when 'Quarterly' then joining_date + interval '90 days'
    when 'Half-Yearly' then joining_date + interval '180 days'
    when 'Annual' then joining_date + interval '365 days'
    else joining_date + interval '30 days'
  end::date;
$$;

create or replace function public.is_gym_member(target_gym uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.gym_memberships gm
    where gm.gym_id = target_gym
      and gm.user_id = auth.uid()
  );
$$;

create or replace function public.is_gym_owner(target_gym uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.gym_memberships gm
    where gm.gym_id = target_gym
      and gm.user_id = auth.uid()
      and gm.role = 'owner'
  );
$$;

alter table public.profiles enable row level security;
alter table public.gyms enable row level security;
alter table public.gym_memberships enable row level security;
alter table public.members enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.whatsapp_reminders enable row level security;

drop policy if exists "profiles self read" on public.profiles;
create policy "profiles self read"
on public.profiles
for select
using (id = auth.uid());

drop policy if exists "profiles self write" on public.profiles;
create policy "profiles self write"
on public.profiles
for all
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "gyms members read" on public.gyms;
create policy "gyms members read"
on public.gyms
for select
using (public.is_gym_member(id));

drop policy if exists "gyms owner insert" on public.gyms;
create policy "gyms owner insert"
on public.gyms
for insert
with check (owner_id = auth.uid());

drop policy if exists "gyms owner update" on public.gyms;
create policy "gyms owner update"
on public.gyms
for update
using (public.is_gym_owner(id))
with check (public.is_gym_owner(id));

drop policy if exists "memberships members read" on public.gym_memberships;
create policy "memberships members read"
on public.gym_memberships
for select
using (public.is_gym_member(gym_id));

drop policy if exists "memberships owner manage" on public.gym_memberships;
create policy "memberships owner manage"
on public.gym_memberships
for all
using (public.is_gym_owner(gym_id))
with check (public.is_gym_owner(gym_id));

drop policy if exists "memberships initial owner insert" on public.gym_memberships;
create policy "memberships initial owner insert"
on public.gym_memberships
for insert
with check (
  role = 'owner'
  and user_id = auth.uid()
  and exists (
    select 1
    from public.gyms g
    where g.id = gym_id
      and g.owner_id = auth.uid()
  )
);

drop policy if exists "members gym read" on public.members;
create policy "members gym read"
on public.members
for select
using (public.is_gym_member(gym_id));

drop policy if exists "members gym write" on public.members;
create policy "members gym write"
on public.members
for all
using (public.is_gym_member(gym_id))
with check (public.is_gym_member(gym_id));

drop policy if exists "attendance gym read" on public.attendance_sessions;
create policy "attendance gym read"
on public.attendance_sessions
for select
using (public.is_gym_member(gym_id));

drop policy if exists "attendance gym write" on public.attendance_sessions;
create policy "attendance gym write"
on public.attendance_sessions
for all
using (public.is_gym_member(gym_id))
with check (public.is_gym_member(gym_id));

drop policy if exists "reminders gym read" on public.whatsapp_reminders;
create policy "reminders gym read"
on public.whatsapp_reminders
for select
using (public.is_gym_member(gym_id));

drop policy if exists "reminders owner write" on public.whatsapp_reminders;
create policy "reminders owner write"
on public.whatsapp_reminders
for all
using (public.is_gym_owner(gym_id))
with check (public.is_gym_owner(gym_id));
