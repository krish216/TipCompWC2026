-- Migration 057: Pre-tournament demo mode tables

-- demo_fixtures: mirrors group stage fixtures from real fixtures table
-- Populated once by admin; real kickoff times preserved
CREATE TABLE IF NOT EXISTS public.demo_fixtures (
  id             serial      PRIMARY KEY,
  real_fixture_id int        REFERENCES public.fixtures(id) ON DELETE CASCADE,
  tournament_id  uuid        NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  round          text        NOT NULL DEFAULT 'gs',
  grp            text,
  home           text        NOT NULL,
  away           text        NOT NULL,
  kickoff_utc    timestamptz NOT NULL,
  venue          text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_demo_fixtures_tournament ON public.demo_fixtures (tournament_id);
CREATE INDEX IF NOT EXISTS idx_demo_fixtures_kickoff    ON public.demo_fixtures (kickoff_utc);

-- demo_results: AI-generated scores for each demo fixture
-- Regeneratable at any time by tournament admin
CREATE TABLE IF NOT EXISTS public.demo_results (
  id               serial      PRIMARY KEY,
  demo_fixture_id  int         NOT NULL REFERENCES public.demo_fixtures(id) ON DELETE CASCADE,
  home_score       int         NOT NULL,
  away_score       int         NOT NULL,
  result_outcome   char(1),    -- 'H','A','D'
  generated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (demo_fixture_id)
);

CREATE INDEX IF NOT EXISTS idx_demo_results_fixture ON public.demo_results (demo_fixture_id);

-- demo_predictions: tipster predictions against demo fixtures
-- Reveal rule enforced at API layer: result only visible after prediction submitted
CREATE TABLE IF NOT EXISTS public.demo_predictions (
  id              serial      PRIMARY KEY,
  user_id         uuid        NOT NULL REFERENCES public.users(id)  ON DELETE CASCADE,
  demo_fixture_id int         NOT NULL REFERENCES public.demo_fixtures(id) ON DELETE CASCADE,
  outcome         char(1),    -- 'H','A','D'
  submitted_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, demo_fixture_id)
);

CREATE INDEX IF NOT EXISTS idx_demo_predictions_user    ON public.demo_predictions (user_id);
CREATE INDEX IF NOT EXISTS idx_demo_predictions_fixture ON public.demo_predictions (demo_fixture_id);

-- demo_points: computed points per (user, fixture) — recalculated when results regenerated
CREATE TABLE IF NOT EXISTS public.demo_points (
  id              serial      PRIMARY KEY,
  user_id         uuid        NOT NULL REFERENCES public.users(id)  ON DELETE CASCADE,
  demo_fixture_id int         NOT NULL REFERENCES public.demo_fixtures(id) ON DELETE CASCADE,
  points          int         NOT NULL DEFAULT 0,
  is_correct      boolean     NOT NULL DEFAULT false,
  calculated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, demo_fixture_id)
);

CREATE INDEX IF NOT EXISTS idx_demo_points_user ON public.demo_points (user_id);

-- RLS: demo data is public-readable, only service role can write
ALTER TABLE public.demo_fixtures    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demo_results     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demo_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demo_points      ENABLE ROW LEVEL SECURITY;

-- Public read on fixtures and results
CREATE POLICY "demo_fixtures_public_read"  ON public.demo_fixtures    FOR SELECT USING (true);
CREATE POLICY "demo_results_public_read"   ON public.demo_results     FOR SELECT USING (true);

-- Predictions: users can insert/read their own
CREATE POLICY "demo_predictions_user_read"   ON public.demo_predictions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "demo_predictions_user_insert" ON public.demo_predictions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Points: public read (for leaderboard)
CREATE POLICY "demo_points_public_read" ON public.demo_points FOR SELECT USING (true);

SELECT 'Migration 057 complete — demo tables created' AS status;
