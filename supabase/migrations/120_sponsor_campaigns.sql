-- 120: Sponsor Campaigns module
-- Promotes the bracket sponsor from a single global app_settings blob into a
-- first-class, scheduled entity that any challenge can plug into.
--
--   sponsors          — the brand (reusable across tournaments); status tracks the
--                       lead -> active -> archived lifecycle. `slug` drives the
--                       per-sponsor storage folder: org-logos/sponsors/{slug}/.
--   challenges        — a registry giving each tournament's challenge a real id so
--                       a campaign can FK to it (vs a magic string). Seeded with one
--                       'bracket' row per existing tournament.
--   sponsor_campaigns — one scheduled placement of a sponsor on a challenge. The
--                       active-campaign resolver gates on enabled + [starts_at, ends_at].
--
-- All access is via the service-role client (resolver, admin CRUD, enquiry); RLS is
-- enabled with no public policies so sponsor PII is never exposed to anon/auth.

-- ── sponsors ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sponsors (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text        NOT NULL UNIQUE,         -- kebab-case; drives storage folder
  name          text        NOT NULL,
  contact_name  text,
  contact_email text,
  phone         text,
  website_url   text,
  logo_url      text,
  logo_tone     text        NOT NULL DEFAULT 'dark', -- 'dark' | 'light' (ink colour of the logo)
  status        text        NOT NULL DEFAULT 'lead', -- 'lead' | 'active' | 'archived'
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ── challenges (registry) ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.challenges (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid        NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  type          text        NOT NULL,                -- 'bracket' | 'four_pick' | ...
  name          text        NOT NULL,
  enabled       boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT challenges_unique UNIQUE (tournament_id, type)
);

-- Seed a 'bracket' challenge for every existing tournament.
INSERT INTO public.challenges (tournament_id, type, name)
SELECT id, 'bracket', 'Bracket Challenge' FROM public.tournaments
ON CONFLICT (tournament_id, type) DO NOTHING;

-- ── sponsor_campaigns ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sponsor_campaigns (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_id   uuid        NOT NULL REFERENCES public.sponsors(id)   ON DELETE CASCADE,
  challenge_id uuid        NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  prize        text,
  click_url    text,                                 -- overrides sponsor.website_url when set
  logo_tone    text,                                 -- overrides sponsor.logo_tone when set
  starts_at    timestamptz,
  ends_at      timestamptz,
  enabled      boolean     NOT NULL DEFAULT true,     -- kill switch independent of the schedule
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sponsor_campaigns_challenge ON public.sponsor_campaigns (challenge_id);
CREATE INDEX IF NOT EXISTS sponsor_campaigns_window    ON public.sponsor_campaigns (enabled, starts_at, ends_at);

-- ── grants (PostgREST visibility — enforced Oct 30 2026) ──────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sponsors          TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.challenges        TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sponsor_campaigns TO anon, authenticated;
GRANT ALL ON TABLE public.sponsors          TO service_role;
GRANT ALL ON TABLE public.challenges        TO service_role;
GRANT ALL ON TABLE public.sponsor_campaigns TO service_role;

-- ── RLS: enabled with NO public policies → service-role only ──────────────────
ALTER TABLE public.sponsors          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenges        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sponsor_campaigns ENABLE ROW LEVEL SECURITY;
