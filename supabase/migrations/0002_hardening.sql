-- 0002, security and operations hardening. Run after 0001, once per Supabase project.
-- Safe to re-run: every statement checks before it changes anything.
-- Adds: one-time invite codes, rate limiting for login/sign-up/writes, date-safe usage reads,
-- size limits on tracker rows, and a small analytics event log.

-- ── Invite codes ────────────────────────────────────────────
-- An invite now needs a one-time code as well as the email, so knowing someone's address is
-- not enough to claim their account. Only a SHA-256 of the code is stored; the admin sees the
-- code once, when it is made. Cleared after a successful sign-up so it cannot be reused.
alter table invites add column if not exists code_hash text;

-- ── Rate limiting ───────────────────────────────────────────
-- Fixed-window counters keyed by what is being limited, e.g. "login:email:a@b.com".
-- Kept in Postgres so the limit holds across serverless instances.
create table if not exists rate_limits (
  key          text        not null,
  window_start timestamptz not null,
  count        int         not null default 0,
  primary key (key, window_start)
);
create index if not exists rate_limits_window_idx on rate_limits (window_start);
alter table rate_limits enable row level security;

-- Counts one attempt against p_key and returns true while the window's count is within p_limit.
-- Also drops windows older than a day, so the table never grows without bound.
create or replace function hit_rate_limit(p_key text, p_limit int, p_window_seconds int) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  win   timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  total int;
begin
  delete from rate_limits where window_start < now() - interval '1 day';
  insert into rate_limits (key, window_start, count) values (p_key, win, 1)
  on conflict (key, window_start) do update set count = rate_limits.count + 1
  returning count into total;
  return total <= p_limit;
end $$;

-- ── Usage reads on the database's own date ──────────────────
-- claim_generation counts against current_date; reading "today" the same way keeps the limit
-- and the displayed count in agreement whatever timezone the server or database runs in.
create or replace function usage_today(p_user uuid default null)
returns table (user_id uuid, count int)
language sql security definer set search_path = public as $$
  select u.user_id, u.count from usage u
  where u.day = current_date and (p_user is null or u.user_id = p_user);
$$;

-- ── Tracker size limits ─────────────────────────────────────
-- The API enforces the same limits with friendly messages; these stop anything that slips past.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'applications_size_limits') then
    alter table applications add constraint applications_size_limits check (
      char_length(company) <= 200
      and char_length(role) <= 200
      and (link is null or char_length(link) <= 2000)
      and (notes is null or char_length(notes) <= 5000)
      and (cover_letter is null or char_length(cover_letter) <= 10000)
      and (cv is null or char_length(cv::text) <= 100000)
    );
  end if;
end $$;

-- ── Analytics ───────────────────────────────────────────────
-- What people actually use: sign-ups, logins, generations by mode, saves. No page content and
-- no personal data beyond the user id. Written and read by the server only.
create table if not exists events (
  id         bigint generated always as identity primary key,
  user_id    uuid references auth.users (id) on delete set null,
  name       text not null check (char_length(name) <= 60),  -- "generate.tailor", "login"
  created_at timestamptz not null default now()
);
create index if not exists events_created_idx on events (created_at desc);
alter table events enable row level security;

-- Totals per event name over the last p_days days, for the Admin page.
create or replace function event_summary(p_days int)
returns table (name text, total bigint, users bigint)
language sql security definer set search_path = public as $$
  select e.name, count(*), count(distinct e.user_id) from events e
  where e.created_at >= now() - make_interval(days => p_days)
  group by e.name order by count(*) desc;
$$;

-- ── Permissions ─────────────────────────────────────────────
-- Server (service key) only. Logged-in users must never call these directly.
revoke execute on function hit_rate_limit(text, int, int) from public, anon, authenticated;
revoke execute on function usage_today(uuid)              from public, anon, authenticated;
revoke execute on function event_summary(int)             from public, anon, authenticated;
grant  execute on function hit_rate_limit(text, int, int) to service_role;
grant  execute on function usage_today(uuid)              to service_role;
grant  execute on function event_summary(int)             to service_role;
