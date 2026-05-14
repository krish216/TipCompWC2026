-- Migration 098 — bracket_predictions: stores champion + runner-up per browser session / user

CREATE TABLE IF NOT EXISTS public.bracket_predictions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    text        NOT NULL,
  tournament_id uuid        NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  user_id       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  champion      text,
  runner_up     text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- One row per browser session + tournament (covers both guest and signed-in rows)
CREATE UNIQUE INDEX bracket_predictions_session
  ON public.bracket_predictions (session_id, tournament_id);

-- One row per signed-in user + tournament
CREATE UNIQUE INDEX bracket_predictions_user
  ON public.bracket_predictions (user_id, tournament_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX bracket_predictions_tournament
  ON public.bracket_predictions (tournament_id);

ALTER TABLE public.bracket_predictions ENABLE ROW LEVEL SECURITY;

-- Signed-in users can read their own prediction row; all writes go via service-role API.
CREATE POLICY "bracket_predictions_own"
  ON public.bracket_predictions FOR SELECT
  USING (auth.uid() = user_id);

SELECT '098 complete — bracket_predictions table created' AS status;
