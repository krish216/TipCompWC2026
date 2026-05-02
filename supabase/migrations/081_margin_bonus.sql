-- Migration 081 — margin_bonus on tournament_rounds + fav_team_2x base-only multiplier
--
-- margin_bonus: awarded when tipster predicts correct result (H/D/A) but not exact
--   score, AND the goal-difference margin matches (|pred_h - pred_a| = |result_h - result_a|).
--   Applies only on predict_mode = 'score' rounds.
--
-- fav_team_2x change: multiplier now applies to base result_pts only, not total.
--   Before: points = (std + exact_e + pen_e) * 2
--   After:  points =  std*2 + exact_e + margin_e + pen_e

-- ── 1. Add column ─────────────────────────────────────────────────────────────
ALTER TABLE public.tournament_rounds
  ADD COLUMN IF NOT EXISTS margin_bonus int NOT NULL DEFAULT 5;

-- ── 2. Rewrite scoring trigger ───────────────────────────────────────────────
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

  IF NOT FOUND THEN
    UPDATE public.predictions
    SET standard_points = 0,
        bonus_points    = 0,
        points_earned   = 0,
        updated_at      = now()
    WHERE fixture_id = NEW.id;
    RETURN NEW;
  END IF;

  WITH scored AS (
    SELECT
      p.id,

      -- standard: result_pts when correct result (H/D/A), else 0
      CASE
        WHEN rc.predict_mode = 'score' THEN
          CASE WHEN
            (CASE WHEN p.home  > p.away  THEN 'H' WHEN p.away  > p.home  THEN 'A' ELSE 'D' END)
          = (CASE WHEN NEW.home_score > NEW.away_score THEN 'H' WHEN NEW.away_score > NEW.home_score THEN 'A' ELSE 'D' END)
          THEN rc.result_pts ELSE 0 END
        ELSE
          CASE WHEN p.outcome = NEW.result_outcome THEN rc.result_pts ELSE 0 END
      END AS std,

      -- exact score bonus (score rounds only, exact scoreline)
      CASE
        WHEN rc.predict_mode = 'score'
          AND rc.exact_bonus > 0
          AND p.home = NEW.home_score
          AND p.away = NEW.away_score
        THEN rc.exact_bonus ELSE 0
      END AS exact_e,

      -- margin bonus (score rounds only: correct result, not exact, same goal diff)
      CASE
        WHEN rc.predict_mode = 'score'
          AND rc.margin_bonus > 0
          AND p.home IS NOT NULL AND p.away IS NOT NULL
          AND NOT (p.home = NEW.home_score AND p.away = NEW.away_score)
          AND (CASE WHEN p.home  > p.away  THEN 'H' WHEN p.away  > p.home  THEN 'A' ELSE 'D' END)
            = (CASE WHEN NEW.home_score > NEW.away_score THEN 'H' WHEN NEW.away_score > NEW.home_score THEN 'A' ELSE 'D' END)
          AND ABS(p.home - p.away) = ABS(NEW.home_score - NEW.away_score)
        THEN rc.margin_bonus ELSE 0
      END AS margin_e,

      -- pen winner bonus
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

      -- fav team flag
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
    -- fav_team_2x doubles base pts only; bonuses awarded flat
    bonus_points    = CASE WHEN s.has_fav THEN s.std ELSE 0 END
                    + s.exact_e + s.margin_e + s.pen_e,
    points_earned   = s.std
                    + CASE WHEN s.has_fav THEN s.std ELSE 0 END
                    + s.exact_e + s.margin_e + s.pen_e,
    updated_at      = now()
  FROM scored s
  WHERE p.id = s.id;

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

-- ── 3. Rewrite retroactive insert trigger ────────────────────────────────────
CREATE OR REPLACE FUNCTION auto_score_prediction_on_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  fx  public.fixtures%ROWTYPE;
  rc  public.tournament_rounds%ROWTYPE;
BEGIN
  SELECT * INTO fx
  FROM public.fixtures
  WHERE id = NEW.fixture_id AND home_score IS NOT NULL;

  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT * INTO rc
  FROM public.tournament_rounds
  WHERE tournament_id = NEW.tournament_id
    AND round_code    = fx.round::text
  LIMIT 1;

  IF NOT FOUND THEN RETURN NEW; END IF;

  WITH scored AS (
    SELECT
      CASE
        WHEN rc.predict_mode = 'score' THEN
          CASE WHEN
            (CASE WHEN NEW.home  > NEW.away  THEN 'H' WHEN NEW.away  > NEW.home  THEN 'A' ELSE 'D' END)
          = (CASE WHEN fx.home_score > fx.away_score THEN 'H' WHEN fx.away_score > fx.home_score THEN 'A' ELSE 'D' END)
          THEN rc.result_pts ELSE 0 END
        ELSE
          CASE WHEN NEW.outcome = fx.result_outcome THEN rc.result_pts ELSE 0 END
      END AS std,

      CASE
        WHEN rc.predict_mode = 'score' AND rc.exact_bonus > 0
          AND NEW.home = fx.home_score AND NEW.away = fx.away_score
        THEN rc.exact_bonus ELSE 0
      END AS exact_e,

      CASE
        WHEN rc.predict_mode = 'score'
          AND rc.margin_bonus > 0
          AND NEW.home IS NOT NULL AND NEW.away IS NOT NULL
          AND NOT (NEW.home = fx.home_score AND NEW.away = fx.away_score)
          AND (CASE WHEN NEW.home  > NEW.away  THEN 'H' WHEN NEW.away  > NEW.home  THEN 'A' ELSE 'D' END)
            = (CASE WHEN fx.home_score > fx.away_score THEN 'H' WHEN fx.away_score > fx.home_score THEN 'A' ELSE 'D' END)
          AND ABS(NEW.home - NEW.away) = ABS(fx.home_score - fx.away_score)
        THEN rc.margin_bonus ELSE 0
      END AS margin_e,

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
    bonus_points    = CASE WHEN s.has_fav THEN s.std ELSE 0 END
                    + s.exact_e + s.margin_e + s.pen_e,
    points_earned   = s.std
                    + CASE WHEN s.has_fav THEN s.std ELSE 0 END
                    + s.exact_e + s.margin_e + s.pen_e,
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

-- ── 4. Rescore all existing results ──────────────────────────────────────────
UPDATE public.fixtures SET home_score = home_score WHERE home_score IS NOT NULL;

-- ── 5. Rebuild leaderboard ────────────────────────────────────────────────────
REFRESH MATERIALIZED VIEW public.leaderboard;

SELECT 'Migration 081 complete — margin_bonus added, fav_team_2x now applies to base pts only' AS status;
