-- Migration 050 — scoring trigger reads from tournament_rounds table
-- Single source of truth: no hardcoded points in PL/pgSQL.
-- Falls back gracefully to 0 if round config is missing.

CREATE OR REPLACE FUNCTION score_predictions_for_fixture()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  rc             public.tournament_rounds%ROWTYPE;
  sc_exact_total int;
BEGIN
  -- Load round config from tournament_rounds table
  SELECT * INTO rc
  FROM public.tournament_rounds
  WHERE tournament_id = NEW.tournament_id
    AND round_code    = NEW.round::text
  LIMIT 1;

  -- No config found — zero out points and bail
  IF NOT FOUND THEN
    UPDATE public.predictions
    SET points_earned = 0, updated_at = now()
    WHERE fixture_id = NEW.id;
    RETURN NEW;
  END IF;

  sc_exact_total := rc.result_pts + rc.exact_bonus;

  UPDATE public.predictions p
  SET points_earned = (
    CASE

      -- ── Score-prediction rounds (predict_mode = 'score') ─────────────────
      -- Player predicts exact scoreline. Exact score = result_pts + exact_bonus.
      -- Correct result only = result_pts (+ pen_bonus if pen winner correct).
      WHEN rc.predict_mode = 'score' THEN
        CASE
          -- Exact scoreline
          WHEN p.home = NEW.home_score AND p.away = NEW.away_score
            THEN sc_exact_total

          -- Correct result (not exact)
          WHEN (CASE WHEN p.home  > p.away  THEN 'H'
                     WHEN p.away  > p.home  THEN 'A' ELSE 'D' END)
             = (CASE WHEN NEW.home_score > NEW.away_score THEN 'H'
                     WHEN NEW.away_score > NEW.home_score THEN 'A' ELSE 'D' END)
            THEN rc.result_pts
              + CASE
                  WHEN rc.pen_bonus > 0
                    AND NEW.home_score = NEW.away_score   -- draw → went to pens
                    AND NEW.pen_winner IS NOT NULL
                    AND p.pen_winner   = NEW.pen_winner
                  THEN rc.pen_bonus ELSE 0
                END

          ELSE 0
        END

      -- ── Outcome-only rounds (predict_mode = 'outcome') ───────────────────
      -- Player picks H / D / A. Correct = result_pts (+ pen_bonus if applicable).
      ELSE
        CASE
          WHEN p.outcome = NEW.result_outcome
            THEN rc.result_pts
              + CASE
                  WHEN rc.pen_bonus > 0
                    AND NEW.result_outcome = 'D'
                    AND NEW.pen_winner IS NOT NULL
                    AND p.pen_winner   = NEW.pen_winner
                  THEN rc.pen_bonus ELSE 0
                END
          ELSE 0
        END

    END
  ) * (
    -- ── Favourite team 2× multiplier ─────────────────────────────────────
    CASE
      WHEN rc.fav_team_2x AND EXISTS (
        SELECT 1 FROM public.user_tournaments ut
        WHERE ut.user_id       = p.user_id
          AND ut.tournament_id = NEW.tournament_id
          AND ut.favourite_team IN (NEW.home, NEW.away)
      ) THEN 2
      ELSE 1
    END
  )
  WHERE p.fixture_id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_score_predictions ON public.fixtures;
CREATE TRIGGER trg_score_predictions
  AFTER INSERT OR UPDATE OF home_score, away_score, pen_winner, result_outcome
  ON public.fixtures
  FOR EACH ROW
  WHEN (NEW.home_score IS NOT NULL)
  EXECUTE FUNCTION score_predictions_for_fixture();

-- Re-score all existing fixtures with the new trigger
UPDATE public.fixtures SET home_score = home_score WHERE home_score IS NOT NULL;

REFRESH MATERIALIZED VIEW public.leaderboard;

SELECT 'Migration 050 complete — scoring trigger now reads tournament_rounds' AS status;
