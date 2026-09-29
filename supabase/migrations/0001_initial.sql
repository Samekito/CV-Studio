-- 0001, the first multi-user schema. Paste into Supabase: SQL Editor > New query > Run.
-- Multi-user: every row that belongs to a person carries their auth user id, and Row Level
-- Security makes Postgres itself refuse to return anyone else's rows. Route handlers query as
-- the logged-in user, so a bug in app code still cannot leak another user's data.
-- invites and usage have RLS on with no policies: only the server's service key can touch them.

-- Who may create an account. The admin adds emails from the Admin page.
create table if not exists invites (
  email      text primary key check (email = lower(email)),  -- stored lowercase so lookups match
  created_at timestamptz not null default now()
);

-- One per user: their Fact Bank and the labels for their tracks.
create table if not exists profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null,                  -- used for the CV header and download file names
  tracks     jsonb not null default '{}',    -- {"A": "Product Builder / QA", "B": ...}, 1 to 3 of A/B/C
  fact_bank  text not null,                  -- markdown, same 9-section layout as src/data/fact-bank-template.md
  updated_at timestamptz not null default now()
);

create table if not exists applications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  company      text not null,                 -- "xAI"
  role         text not null,                 -- "AI Tutor - Yoruba"
  track        text check (track in ('A','B','C')),
  status       text not null default 'draft'
               check (status in ('draft','applied','interview','offer','rejected','withdrawn')),
  applied_on   date,
  link         text,                          -- job ad URL
  notes        text,
  cv           jsonb,                         -- the exact CV sent, so it can be re-downloaded
  cover_letter text,
  created_at   timestamptz not null default now()
);
create index if not exists applications_user_idx on applications (user_id, created_at desc);

-- Generations per user per UTC day, for the daily limit.
create table if not exists usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null default current_date,
  count   int  not null default 0,
  primary key (user_id, day)
);

alter table invites      enable row level security;
alter table profiles     enable row level security;
alter table applications enable row level security;
alter table usage        enable row level security;

drop policy if exists "own profile" on profiles;
create policy "own profile" on profiles
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own applications" on applications;
create policy "own applications" on applications
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Takes one generation from today's allowance in a single statement, so two requests at the
-- same moment cannot both squeeze past the limit. Returns false when the limit is used up.
create or replace function claim_generation(p_user uuid, p_limit int) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  claimed int;
begin
  insert into usage (user_id, day, count) values (p_user, current_date, 1)
  on conflict (user_id, day) do update set count = usage.count + 1
    where usage.count < p_limit
  returning count into claimed;
  return claimed is not null;
end $$;

-- Gives a generation back when the model call failed, so a busy provider does not eat the allowance.
create or replace function release_generation(p_user uuid) returns void
language sql security definer set search_path = public as $$
  update usage set count = greatest(count - 1, 0) where user_id = p_user and day = current_date;
$$;

-- The limit is a parameter, so logged-in users must never be able to call these directly.
revoke execute on function claim_generation(uuid, int) from public, anon, authenticated;
revoke execute on function release_generation(uuid)    from public, anon, authenticated;
grant  execute on function claim_generation(uuid, int) to service_role;
grant  execute on function release_generation(uuid)    to service_role;
