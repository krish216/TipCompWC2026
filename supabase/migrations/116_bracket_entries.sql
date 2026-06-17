-- 116: Bracket Challenge entries (prize registration + tie-breakers)
-- A user "enters" the prize comp once their bracket is complete (champion picked).
-- Entry captures the tie-break predictions (total goals in the Final and the
-- 3rd-place match) + consent. One entry per user per tournament. Writes go via the
-- service-role entry API; users may read their own row.

CREATE TABLE IF NOT EXISTS public.bracket_entries (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tournament_id uuid        NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  final_goals   smallint,   -- tie-break 1: predicted total goals in the Final
  tp_goals      smallint,   -- tie-break 2: predicted total goals in the 3rd-place match
  phone         text,
  consent_terms     boolean NOT NULL DEFAULT false,  -- required to enter
  consent_marketing boolean NOT NULL DEFAULT false,  -- optional: share with sponsor
  source        text,                                -- 'member' | 'guest' (Phase 3)
  entered_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bracket_entries_unique UNIQUE (user_id, tournament_id)
);

CREATE INDEX IF NOT EXISTS bracket_entries_tournament ON public.bracket_entries (tournament_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.bracket_entries TO anon, authenticated;
GRANT ALL ON TABLE public.bracket_entries TO service_role;

ALTER TABLE public.bracket_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bracket_entries_select_own"
  ON public.bracket_entries FOR SELECT
  USING (auth.uid() = user_id);
