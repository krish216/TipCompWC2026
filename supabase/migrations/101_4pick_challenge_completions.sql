-- Migration 101 — 4pick_challenge_completions
--
-- One row per session (anonymous) or user per tournament.
-- Records when someone completes the 4-Pick Challenge and whether they
-- subsequently registered (signed_up_at), enabling conversion funnel analysis.

CREATE TABLE IF NOT EXISTS public.four_pick_challenge_completions (
  id             uuid        NOT NULL DEFAULT gen_random_uuid(),
  session_id     text        NOT NULL,
  user_id        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  tournament_id  uuid        NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  source         text,                    -- first-touch ?ref= URL param
  device         text,                    -- mobile | desktop
  completed_at   timestamptz NOT NULL,    -- when the 4th pick was submitted
  signed_up_at   timestamptz,             -- when the challenger converted to a registered user
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT four_pick_challenge_completions_pkey PRIMARY KEY (id)
);

-- One row per authenticated user per tournament
CREATE UNIQUE INDEX IF NOT EXISTS fpc_completions_user_tourn
  ON public.four_pick_challenge_completions (user_id, tournament_id)
  WHERE user_id IS NOT NULL;

-- One row per anonymous session per tournament
CREATE UNIQUE INDEX IF NOT EXISTS fpc_completions_session_tourn
  ON public.four_pick_challenge_completions (session_id, tournament_id);

SELECT '101 complete — four_pick_challenge_completions table created' AS status;
