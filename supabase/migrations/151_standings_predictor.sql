-- 151_standings_predictor.sql
-- The quartered "Top-N / Bottom-N" table predictor — EPL's flagship challenge (the
-- league analog of the knockout bracket). Fans predict which teams finish in the top
-- and bottom buckets of the league table at four checkpoints through the season; each
-- quarter locks at its start and settles from the actual table at its checkpoint.

-- Config: the quarters for a tournament (seeded). One row per quarter.
CREATE TABLE IF NOT EXISTS public.standings_quarters (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id      uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  quarter            smallint NOT NULL,             -- 1..4
  label              text NOT NULL,                 -- "First Quarter", "New Year Table", ...
  checkpoint_round   text NOT NULL,                 -- e.g. 'r9' — settle once this round is complete
  checkpoint_games   smallint NOT NULL,             -- games played per team at the checkpoint (9/19/28/38)
  locks_at           timestamptz NOT NULL,          -- deadline: predictions lock at the start of the quarter
  top_n              smallint NOT NULL DEFAULT 5,
  bottom_n           smallint NOT NULL DEFAULT 3,
  points_per_correct smallint NOT NULL DEFAULT 3,    -- per team correctly placed in a bucket
  settled_at         timestamptz,                   -- null until scored
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, quarter)
);
CREATE INDEX IF NOT EXISTS standings_quarters_tournament ON public.standings_quarters (tournament_id);

-- Entries: a user's predicted buckets for one quarter.
CREATE TABLE IF NOT EXISTS public.standings_predictions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  quarter       smallint NOT NULL,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  top_teams     text[] NOT NULL DEFAULT '{}',       -- predicted top-N team names
  bottom_teams  text[] NOT NULL DEFAULT '{}',       -- predicted bottom-N team names
  points        int,                                -- settled points (null until the quarter settles)
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, user_id, quarter)
);
CREATE INDEX IF NOT EXISTS standings_predictions_lookup ON public.standings_predictions (tournament_id, quarter);
CREATE INDEX IF NOT EXISTS standings_predictions_user ON public.standings_predictions (user_id);

-- RLS: public read (leaderboard/board is public); writes go through the service-role
-- API only (which bypasses RLS), so no INSERT/UPDATE policy for regular roles.
ALTER TABLE public.standings_quarters     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.standings_predictions  ENABLE ROW LEVEL SECURITY;
CREATE POLICY standings_quarters_read    ON public.standings_quarters    FOR SELECT USING (true);
CREATE POLICY standings_predictions_read ON public.standings_predictions FOR SELECT USING (true);

-- Explicit PostgREST grants (required for new tables — see CLAUDE.md).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.standings_quarters    TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.standings_predictions TO anon, authenticated;
GRANT ALL ON TABLE public.standings_quarters    TO service_role;
GRANT ALL ON TABLE public.standings_predictions TO service_role;
