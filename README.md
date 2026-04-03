# WC2026 Predictor ⚽

Predict every match of the 2026 FIFA World Cup. Compete with your tribe across all 7 rounds with escalating points.

## Quick start (local)

```bash
# 1. Install dependencies
npm install

# 2. Copy env template and fill in your keys
cp .env.example .env.local

# 3. Run the app
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Full deployment guide

### Step 1 — Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project**
2. Choose a region close to your users (recommend `us-east-1` for North America tournament audience)
3. Once created, go to **Settings → API** and copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` secret → `SUPABASE_SERVICE_ROLE_KEY`

### Step 2 — Run database migration

In Supabase dashboard → **SQL Editor** → paste and run:

```
supabase/migrations/001_initial.sql
```

This creates all tables, triggers, RLS policies, and the leaderboard view.

### Step 3 — Generate TypeScript types

```bash
npx supabase gen types typescript \
  --project-id YOUR_PROJECT_REF \
  --schema public \
  > src/types/database.ts
```

Replace the stub file with the generated output for full type safety.

### Step 4 — Fill in environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local`:

| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API |
| `NEXTAUTH_SECRET` | Run: `openssl rand -base64 32` |
| `RESEND_API_KEY` | resend.com → API Keys |
| `API_FOOTBALL_KEY` | rapidapi.com → API-Football |
| `ONESIGNAL_APP_ID` + `ONESIGNAL_API_KEY` | onesignal.com |
| `STRIPE_SECRET_KEY` | dashboard.stripe.com |
| `CRON_SECRET` | Run: `openssl rand -base64 32` |

### Step 5 — Seed fixtures

```bash
node scripts/seed.js
```

Loads all 104 WC2026 match fixtures into the database.

### Step 6 — Enable Supabase Realtime

Supabase dashboard → **Database → Replication** → enable for:
- `fixtures`
- `predictions`
- `chat_messages`

### Step 7 — Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

Or push to GitHub and import the repo at [vercel.com/new](https://vercel.com/new). Vercel auto-detects Next.js.

Add all variables from `.env.local` to **Vercel → Settings → Environment Variables**.
Set `NEXT_PUBLIC_APP_URL` to your Vercel domain (e.g. `https://wc2026predictor.vercel.app`).

### Step 8 — Set Supabase redirect URL

Supabase → **Auth → URL Configuration** → add your domain to **Redirect URLs**:

```
https://your-domain.vercel.app/**
```

### Step 9 — Create your admin account

1. Register at `/login` with your email
2. In Supabase SQL Editor, run:

```sql
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"role":"admin"}'::jsonb
WHERE email = 'your@email.com';
```

You now have access to `/admin` to enter match results.

### Step 10 — Verify cron jobs

Vercel automatically registers the cron jobs from `vercel.json`:
- `/api/scores/sync` — every 2 minutes (live score sync)
- `/api/notifications/reminders` — every 15 minutes (pre-match reminders)

Add `CRON_SECRET` to Vercel env vars to secure the endpoints.

---

## Scoring system

| Round | Exact score | Correct result |
|---|---|---|
| Group stage | 5 pts | 3 pts |
| Round of 32 | 8 pts | 5 pts |
| Round of 16 | 10 pts | 7 pts |
| Quarter-finals | 14 pts | 10 pts |
| Semi-finals | 20 pts | 15 pts |
| 3rd place | 25 pts | 20 pts |
| Final | 30 pts | 25 pts |

Predictions lock **5 minutes before kickoff**. No prediction = 0 points.

---

## Tech stack

- **Frontend** — Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Backend** — Next.js API Routes, Supabase (PostgreSQL + Realtime + Auth)
- **Hosting** — Vercel (frontend + crons)
- **Email** — Resend
- **Push notifications** — OneSignal
- **Live scores** — API-Football (RapidAPI)
- **Payments** — Stripe (B2B office pools)
- **CI/CD** — GitHub Actions → Vercel

## Project structure

```
src/
├── app/
│   ├── predict/          # Main prediction page
│   ├── leaderboard/      # Global + tribe rankings
│   ├── tribe/            # Tribe leaderboard + chat
│   ├── admin/            # Result entry (admin only)
│   ├── login/            # Auth page
│   ├── rules/            # Scoring guide
│   ├── settings/         # Notification prefs
│   └── api/              # 8 API route handlers
├── components/
│   ├── game/             # MatchRow, RoundTabs, etc.
│   ├── layout/           # Navbar, SupabaseProvider
│   └── ui/               # Shared primitives
├── hooks/                # usePredictions, useLeaderboard, useTribeChat
├── lib/                  # Supabase client (browser + server + admin)
├── middleware.ts          # Auth + route protection
└── types/                # Domain types + scoring helpers
supabase/
└── migrations/           # 001_initial.sql — full schema
tests/
├── unit/                 # 112 passing tests
├── integration/          # API validation tests
└── e2e/                  # Playwright full-flow tests
scripts/
├── seed.js               # Load all 104 fixtures
└── deploy.sh             # Pre-flight → build → Vercel deploy
```

## Development

```bash
npm run dev          # Start dev server
npm test             # Run unit + integration tests
npm run test:e2e     # Run Playwright E2E tests
npm run type-check   # TypeScript check
npm run build        # Production build
```

## Tournament dates

- **Kickoff**: June 11, 2026 — Mexico vs South Africa, Estadio Azteca
- **Final**: July 19, 2026 — MetLife Stadium, New York/NJ
- **104 matches** across 16 venues in USA, Canada, Mexico
