# CV Studio

An invite-only web app for job applications. Each person keeps their own Fact Bank (the facts
about them the app is allowed to use). Paste a job ad and get a fit check, a tailored CV (.docx
and PDF) and a cover letter. It also answers screening questions, writes platform profiles and
tracks every application. The model is told never to go beyond the Fact Bank.

| Page | What it does |
|---|---|
| Tailor | Job ad in, fit score + gaps + tailored CV + cover letter out. Download .docx, print to PDF, save to tracker. |
| Answers & Bios | Screening-question answers; Mercor / LinkedIn / Upwork profile copy with a character counter. |
| Tracker | Every application, its status, and the exact CV and letter that were sent. |
| Fact Bank | Your name, your tracks (the kinds of role you apply for) and your facts. |
| Admin | Admin only: invite people (one-time codes), disable accounts, today's usage, 7-day activity. |

New users land on onboarding: they paste their existing CV, the AI drafts their Fact Bank in the
same layout as `src/data/fact-bank-template.md`, and they review it before saving.

## Environments

Local development never touches production data:

| | Database | Env vars live in |
|---|---|---|
| **Development** | Supabase running in Docker on your machine (`npm run db:start`) | `.env.development.local` (local database) on top of `.env.local` (AI key) |
| **Production** | Your Supabase cloud project | Vercel > Project > Settings > Environment Variables |

`npm run dev` reads `.env.development.local` first, so its local-database values win over any
production values in `.env.local`. Each database has its own `ADMIN_USER_ID`. Ideally use a
separate Gemini or Claude key for development too, so a leaked development key cannot run up
production's bill.

## Local database (Docker)

Needs Docker Desktop running ("Engine running"). The Supabase CLI is a dev dependency.

| Command | What it does |
|---|---|
| `npm run db:start` | Starts local Supabase and, the first time, applies `supabase/migrations/` and `supabase/seed.sql`. Prints the local keys. |
| `npm run db:stop` | Stops it; data is kept. |
| `npm run db:reset` | Wipes the local database and re-applies migrations and seed. |
| `npm run db:status` | Shows the local URLs and keys again. |

First time: put the printed API URL, anon key and service_role key in `.env.development.local` as
`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_KEY` (they are local demo keys, safe
on your machine only). The seed opens one invite: sign up at http://localhost:3000/signup with
`admin@local.test` and code `LOCALADMIN01`, then put that account's id (local Studio at
http://127.0.0.1:54323 > Authentication > Users) in `ADMIN_USER_ID` there and restart `npm run dev`.
After `npm run db:reset`, repeat the sign-up and update the id.

## Setup, once per Supabase project (about 20 minutes)

### 1. Database
1. Create a free project at https://supabase.com.
2. **SQL Editor**, then New query: run each file in `supabase/migrations/` **in number order**
   (`0001_initial.sql`, then `0002_hardening.sql`, ...). An existing project only needs the files
   it has not had yet; each file is safe to run twice.
3. **Authentication**, then **Sign In / Providers**: keep **Email** on and turn **off**
   "Allow new users to sign up". The app creates accounts itself, only for invited emails with a
   valid code; leaving Supabase's own sign-up on would let anyone skip the invite list.
4. **Project Settings**, then **API**: copy the Project URL, the anon (publishable) key and the
   `service_role` (secret) key. Never share the service_role key.

### 2. Your admin account (first time only)
Sign-up always needs an invite code, including yours. In the **SQL Editor**, run this with your own
email (in lower case) and a code you choose, written in **capital letters and digits only**, with
no spaces (the app upper-cases what people type before checking it):

```sql
insert into invites (email, code_hash)
values ('you@example.com', encode(sha256('PICKACODE123'::bytea), 'hex'))
on conflict (email) do update set code_hash = excluded.code_hash;
```

Open the app, choose **Create your account**, and use that email and code. Then, in
**Authentication > Users**, copy your account's UID into `ADMIN_USER_ID` and restart the app
(locally) or redeploy (Vercel). From now on you invite everyone else from the Admin page.

### 3. An AI key
- **Gemini:** https://aistudio.google.com/apikey, then **Create API key**. Because other people's
  CVs go through it, turn on billing for the key (paid tier): Google's free-tier terms allow them
  to use submitted content to improve their products, and the free tier allows only a few dozen
  requests a day. Set a budget alert in Google Cloud Billing at the same time.
- **Or Claude:** buy credit at https://platform.claude.com and create a key. Set
  `LLM_PROVIDER=anthropic`. The default model is `claude-opus-5`; `ANTHROPIC_MODEL=claude-sonnet-5`
  costs less per CV.

### 4. Deploy to Vercel
1. Push this repo to a private GitHub repo.
2. On https://vercel.com/new, import it. Before clicking Deploy, open **Environment Variables**
   and add every required name from `.env.example`, with the **production** project's values.
3. Deploy. Every push to the main branch then redeploys, and Vercel keeps earlier deployments:
   **Deployments > (a previous one) > Promote** rolls back in seconds.
4. **Analytics** tab: enable Web Analytics to see page views (the app already sends them).

A production server refuses to start if a required env var is missing, and the logs say which.

## Inviting people
Admin page, enter their email, **Invite**. Copy the code shown (it is shown only once) and send
the person the app link, their email and the code. They choose **Create your account**. Lost the
code? **New code** replaces it. **Disable** stops an account from logging in again; a session
already open can last up to an hour.

Each person gets `DAILY_GENERATION_LIMIT` generations a day (default 10, resets at midnight UTC).
A failed generation is not counted. The admin has no limit.

## Operations

- **Health check.** `GET /api/health` answers 200 when the app can reach its database and 503 when
  not. Point an uptime monitor (for example UptimeRobot or Better Stack, both have free plans) at
  `https://<your-app>/api/health` with an email alert. That is how you hear about an outage before
  a user does.
- **Logs.** Every API request writes one JSON line (request id, route, user id, status, duration)
  to Vercel's runtime logs; errors add a message. Users who hit an error see a short reference that
  matches the start of the request id. Vercel keeps runtime logs only briefly on its lower plans;
  to keep them longer, add a log drain (Vercel > Settings > Log Drains) to a log service.
- **Backups.** Check what your Supabase plan backs up (Project Settings > Database > Backups) and
  how long for. Free projects are also paused after a stretch of inactivity. Once, restore a backup
  into the development project to prove it works, and note how long it took.
- **CI.** `.github/workflows/ci.yml` runs type-check, lint, unit tests and a production build on
  every push. Do not deploy a red run.
- **Before a release**, see the release gate in `CLAUDE.md` (local-only checks under
  `prod-readiness/`).

## Moving over from the single-user version
- Paste your old Fact Bank on the Fact Bank page (or during onboarding) and set your track names.
- Tracker entries saved in your browser show a **Move them into my account** button on the
  Tracker page. Open the Tracker once in each browser you used.
- `APP_PASSWORD` and `ADMIN_EMAIL` are no longer used; remove them from Vercel.

## Run locally
```
copy .env.example .env.local   (then fill in the AI key; the database comes from .env.development.local)
npm install
npm run dev
```
Start Docker Desktop and `npm run db:start` first (see "Local database"). Open
http://localhost:3000. `npm test` runs the unit tests.

## Troubleshooting
- **"CV Studio is not configured"** or a server that will not start: a required env var is
  missing. The server log names it. Add it, then redeploy (or restart `npm run dev`).
- **"That email and invite code do not match an open invite"**: the code is wrong, already used,
  or was replaced. Make a new code on the Admin page.
- **"Too many attempts"**: login and sign-up allow a few tries per 15 minutes. Wait, then retry.
- **"GEMINI_API_KEY is not set"**: add it, then redeploy.
- **Gemini 404 or "model not found"**: Google renamed the model. Set `GEMINI_MODEL` to a
  current one listed at https://ai.google.dev/gemini-api/docs/models.
- **"The AI provider's daily quota is used up"**: the key is on Gemini's free tier. Turn on
  billing (setup step 3).
