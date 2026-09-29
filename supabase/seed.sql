-- Local development only: `supabase start` and `npm run db:reset` load this after the migrations.
-- Never run it on production. It opens one invite so a fresh local database has a way in:
--   email  admin@local.test
--   code   LOCALADMIN01
-- Sign up with those at http://localhost:3000/signup, then put that account's id in
-- ADMIN_USER_ID in .env.development.local (README, "Local database").
insert into invites (email, code_hash)
values ('admin@local.test', encode(sha256('LOCALADMIN01'::bytea), 'hex'))
on conflict (email) do update set code_hash = excluded.code_hash;
