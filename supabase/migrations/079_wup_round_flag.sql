-- ============================================================
-- Migration 079 — Round-level scoring inclusion flag
-- ============================================================
-- Adds include_in_scoring boolean to tournament_rounds.
-- When false:
--   • scoring trigger zeros out points_earned for predictions in this round
--   • leaderboard breakdown excludes this round
--   • Tribe Picks tab hides picks for this round
--
-- Defaults to TRUE so all existing rounds are unaffected.
-- The 'wup' (Tournament Warm-Up) round defaults to TRUE — warm-up
-- picks count normally.  Admins can flip the flag at any time and
-- re-trigger scoring to retroactively include or exclude a round.
-- ============================================================

-- 1. Add column
ALTER TABLE public.tournament_rounds
  ADD COLUMN IF NOT EXISTS include_in_scoring boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.tournament_rounds.include_in_scoring
  IS 'When false: scoring trigger zeros points for this round, leaderboard and Tribe Picks hide it.';

-- 2. Patch score_predictions_for_fixture to honour include_in_scoring.
--    All other logic is unchanged from migration 069.
CREATE OR REPLACE FUNCTION score_predictions_for_fixture()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  rc  public.tournament_rounds%ROWTYPE;
BEGIN
  SELECT * INTO rc
  FROM public.tournament_rounds
  WHERE tournament_id = NEW.tournament_id
    AND round_code    = NEW.round::text
  LIMIT 1;

  -- Unknown round: zero out and return
  IF NOT FOUND THEN
    UPDATE public.predictions
    SET standard_points = 0,
        bonus_points    = 0,
        points_earned   = 0,
        updated_at      = now()
    WHERE fixture_id = NEW.id;
    RETURN NEW;
  END IF;

  -- Round excluded from scoring: store outcome but award zero points
  IF NOT COALESCE(rc.include_in_scoring, true) THEN
    UPDATE public.predictions
    SET standard_points = 0,
        bonus_points    = 0,
        points_earned   = 0,
        updated_at      = now()
    WHERE fixture_id = NEW.id;
    RETURN NEW;
  END IF;

  -- Normal scoring (unchanged from migration 069)
  WITH scored AS (
    SELECT
      p.id,
      CASE
        WHEN rc.predict_mode = 'score' THEN
          CASE WHEN
            (CASE WHEN p.home  > p.away  THEN 'H' WHEN p.away  > p.home  THEN 'A' ELSE 'D' END)
          = (CASE WHEN NEW.home_score > NEW.away_score THEN 'H' WHEN NEW.away_score > NEW.home_score THEN 'A' ELSE 'D' END)
          THEN rc.result_pts ELSE 0 END
        ELSE
          CASE WHEN p.outcome = NEW.result_outcome THEN rc.result_pts ELSE 0 END
      END AS std,

      CASE
        WHEN rc.predict_mode = 'score'
          AND rc.exact_bonus > 0
          AND p.home = NEW.home_score
          AND p.away = NEW.away_score
        THEN rc.exact_bonus ELSE 0
      END AS exact_e,

      CASE
        WHEN rc.pen_bonus > 0
          AND NEW.pen_winner IS NOT NULL
          AND p.pen_winner = NEW.pen_winner
          AND (
            (rc.predict_mode = 'score'
              AND NEW.home_score = NEW.away_score
              AND (CASE WHEN p.home > p.away THEN 'H' WHEN p.away > p.home THEN 'A' ELSE 'D' END)
                = (CASE WHEN NEW.home_score > NEW.away_score THEN 'H' WHEN NEW.away_score > NEW.home_score THEN 'A' ELSE 'D' END))
            OR
            (rc.predict_mode = 'outcome'
              AND NEW.result_outcome = 'D'
              AND p.outcome = NEW.result_outcome)
          )
        THEN rc.pen_bonus ELSE 0
      END AS pen_e,

      CASE
        WHEN rc.fav_team_2x AND EXISTS (
          SELECT 1 FROM public.user_tournaments ut
          WHERE ut.user_id       = p.user_id
            AND ut.tournament_id = NEW.tournament_id
            AND ut.favourite_team IN (NEW.home, NEW.away)
        ) THEN true ELSE false
      END AS has_fav

    FROM public.predictions p
    WHERE p.fixture_id = NEW.id
  )
  UPDATE public.predictions p
  SET
    standard_points = s.std,
    bonus_points    = s.exact_e + s.pen_e
                    + CASE WHEN s.has_fav THEN s.std + s.exact_e + s.pen_e ELSE 0 END,
    points_earned   = s.std + s.exact_e + s.pen_e
                    + CASE WHEN s.has_fav THEN s.std + s.exact_e + s.pen_e ELSE 0 END,
    updated_at      = now()
  FROM scored s
  WHERE p.id = s.id;

  RETURN NEW;
END;
$$;
