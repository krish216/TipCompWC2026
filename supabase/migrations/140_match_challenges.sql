-- 140: Single-match prediction challenge (e.g. "Pick the score: Socceroos v Egypt")
--
-- Reuses the existing `challenges` registry (a new type='match') + `sponsor_campaigns`
-- for co-branding, adding just a fixture link and an entry table. A fan predicts the
-- full-time scoreline (excl. penalty shootout) and, for a knockout, who advances —
-- which doubles as the draw resolver and a ranking tiebreak. Entries lock at kickoff
-- (challenges.closes_at) and are scored on read against the fixture result.

-- ── challenges: link a challenge to a single fixture (match challenges only) ───
ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS fixture_id integer REFERENCES public.fixtures(id) ON DELETE SET NULL;

-- A tournament can host several match challenges (one per fixture), so the legacy
-- one-row-per-(tournament,type) constraint must go — `slug` is the unique key now
-- (it was already dropped for bracket challenges; this is a defensive no-op if so).
ALTER TABLE public.challenges DROP CONSTRAINT IF EXISTS challenges_unique;

-- ── match_entries (one prediction per user per match challenge) ────────────────
CREATE TABLE IF NOT EXISTS public.match_entries (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id  uuid        NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES public.users(id)      ON DELETE CASCADE,
  fixture_id    integer     NOT NULL REFERENCES public.fixtures(id)   ON DELETE CASCADE,
  pred_home     smallint    NOT NULL,   -- predicted home goals (full-time/ET, excl. penalty shootout)
  pred_away     smallint    NOT NULL,   -- predicted away goals
  advances_team text,                   -- team the entrant thinks goes through (draw resolver + tiebreak)
  phone         text,
  postcode      text,
  consent_terms     boolean NOT NULL DEFAULT false,  -- required to enter
  consent_marketing boolean NOT NULL DEFAULT false,  -- share details with the venue/sponsor
  consent_over18    boolean NOT NULL DEFAULT false,  -- required for AU prize draws
  source        text,                               -- 'member' | 'guest'
  entered_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT match_entries_unique UNIQUE (challenge_id, user_id)
);

CREATE INDEX IF NOT EXISTS match_entries_challenge ON public.match_entries (challenge_id);
CREATE INDEX IF NOT EXISTS match_entries_fixture   ON public.match_entries (fixture_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.match_entries TO anon, authenticated;
GRANT ALL ON TABLE public.match_entries TO service_role;

ALTER TABLE public.match_entries ENABLE ROW LEVEL SECURITY;

-- Users may read their own entry; all writes go through the service-role entry API.
CREATE POLICY "match_entries_select_own"
  ON public.match_entries FOR SELECT
  USING (auth.uid() = user_id);
