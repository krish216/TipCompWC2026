-- Migration 097 — bracket_picks: tournament bracket predictor
--
-- Users pick:
--   grp:{A-L}:{1|2|3}   → team name for 1st/2nd/3rd place in each group
--   third:{A-L}          → team name if this group's 3rd advances to R32 (null = not advancing)
--   r32:{1-16}           → predicted winner of each R32 match
--   r16:{1-8}            → predicted winner of each R16 match
--   qf:{1-4}             → predicted QF winner
--   sf:{1-2}             → predicted SF winner
--   final                → predicted champion

CREATE TABLE IF NOT EXISTS public.bracket_picks (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tournament_id uuid        NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  slot_key      text        NOT NULL,
  team_name     text,
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT bracket_picks_unique UNIQUE (user_id, tournament_id, slot_key)
);

CREATE INDEX bracket_picks_user ON public.bracket_picks (user_id, tournament_id);

ALTER TABLE public.bracket_picks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bracket_picks_own"
  ON public.bracket_picks FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

SELECT '097 complete — bracket_picks table created' AS status;
