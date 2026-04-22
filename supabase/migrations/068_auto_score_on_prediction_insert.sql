-- Migration 068 — auto-score a prediction when inserted/updated on an already-scored fixture
--
-- Problem: the existing trg_score_predictions fires on fixtures UPDATE, scoring all
-- predictions for that fixture. But when a prediction is inserted *after* a result already
-- exists (retroactive mode), no fixture update happens, so the new prediction stays at 0 pts.
--
-- Fix: add a trigger on predictions INSERT / UPDATE OF home, away, outcome, pen_winner
-- that scores that one row inline if its fixture already has a result.
--
-- Infinite-loop safety: the existing trigger updates points_earned/standard_points/bonus_points
-- on predictions — columns NOT listed in this trigger's UPDATE OF clause, so this trigger
-- will NOT re-fire when the other trigger writes scores back.

CREATE OR REPLACE FUNCTION auto_score_prediction_on_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  fx  public.fixtures%ROWTYPE;
  rc  public.tournament_rounds%ROWTYPE;
BEGIN
  -- Only act when the fixture already has a result
  SELECT * INTO fx
  FROM public.fixtures
  WHERE id = NEW.fixture_id AND home_score IS NOT NULL;

  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Load round config
  SELECT * INTO rc
  FROM public.tournament_rounds
  WHERE tournament_id = NEW.tournament_id
    AND round_code    = fx.round::text
  LIMIT 1;

  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Score this single prediction row using the same logic as score_predictions_for_fixture
  WITH scored AS (
    SELECT
      -- standard: correct result H/D/A
      CASE
        WHEN rc.predict_mode = 'score' THEN
          CASE WHEN
            (CASE WHEN NEW.home  > NEW.away  THEN 'H' WHEN NEW.away  > NEW.home  THEN 'A' ELSE 'D' END)
          = (CASE WHEN fx.home_score > fx.away_score THEN 'H' WHEN fx.away_score > fx.home_score THEN 'A' ELSE 'D' END)
          THEN rc.result_pts ELSE 0 END
        ELSE
          CASE WHEN NEW.outcome = fx.result_outcome THEN rc.result_pts ELSE 0 END
      END AS std,

      -- exact score bonus
      CASE
        WHEN rc.predict_mode = 'score' AND rc.exact_bonus > 0
          AND NEW.home = fx.home_score AND NEW.away = fx.away_score
        THEN rc.exact_bonus ELSE 0
      END AS exact_e,

      -- pen winner bonus
      CASE
        WHEN rc.pen_bonus > 0
          AND fx.pen_winner IS NOT NULL
          AND NEW.pen_winner = fx.pen_winner
          AND (
            (rc.predict_mode = 'score'
              AND fx.home_score = fx.away_score
              AND (CASE WHEN NEW.home > NEW.away THEN 'H' WHEN NEW.away > NEW.home THEN 'A' ELSE 'D' END)
                = (CASE WHEN fx.home_score > fx.away_score THEN 'H' WHEN fx.away_score > fx.home_score THEN 'A' ELSE 'D' END))
            OR
            (rc.predict_mode = 'outcome'
              AND fx.result_outcome = 'D'
              AND NEW.outcome = fx.result_outcome)
          )
        THEN rc.pen_bonus ELSE 0
      END AS pen_e,

      -- fav team 2× flag
      CASE
        WHEN rc.fav_team_2x AND EXISTS (
          SELECT 1 FROM public.user_tournaments ut
          WHERE ut.user_id       = NEW.user_id
            AND ut.tournament_id = NEW.tournament_id
            AND ut.favourite_team IN (fx.home, fx.away)
        ) THEN true ELSE false
      END AS has_fav
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
  WHERE p.id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_score_prediction ON public.predictions;
CREATE TRIGGER trg_auto_score_prediction
  AFTER INSERT OR UPDATE OF home, away, outcome, pen_winner
  ON public.predictions
  FOR EACH ROW
  EXECUTE FUNCTION auto_score_prediction_on_insert();

SELECT 'Migration 068 complete — predictions auto-scored on insert when fixture already has result' AS status;
