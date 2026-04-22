-- Migration 069 — Add standard/bonus points split and fix scoring triggers
--
-- Catches up production DBs that ran migrations up to 058 but not 066/068.
-- Safe to re-run: all DDL uses IF NOT EXISTS / CREATE OR REPLACE.
--
-- Changes:
--   1. Add standard_points + bonus_points columns to predictions (if missing)
--   2. Replace score_predictions_for_fixture with version that populates them
--   3. Add auto_score_prediction_on_insert trigger for retroactive predictions
--   4. Backfill fixtures.tournament_id where NULL (points to WC2026)
--   5. Rescore all existing results

-- ── 1. Columns ───────────────────────────────────────────────────────────────
ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS standard_points int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonus_points    int NOT NULL DEFAULT 0;

-- ── 2. Scoring trigger on fixture result entry ────────────────────────────────
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
      -- standard: correct result H/D/A
      CASE
        WHEN rc.predict_mode = 'score' THEN
          CASE WHEN
            (CASE WHEN p.home  > p.away  THEN 'H' WHEN p.away  > p.home  THEN 'A' ELSE 'D' END)
          = (CASE WHEN NEW.home_score > NEW.away_score THEN 'H' WHEN NEW.away_score > NEW.home_score THEN 'A' ELSE 'D' END)
          THEN rc.result_pts ELSE 0 END
        ELSE
          CASE WHEN p.outcome = NEW.result_outcome THEN rc.result_pts ELSE 0 END
      END AS std,

      -- exact score bonus (score-prediction rounds only)
      CASE
        WHEN rc.predict_mode = 'score'
          AND rc.exact_bonus > 0
          AND p.home = NEW.home_score
          AND p.away = NEW.away_score
        THEN rc.exact_bonus ELSE 0
      END AS exact_e,

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

      -- fav team 2× flag
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

DROP TRIGGER IF EXISTS trg_score_predictions ON public.fixtures;
CREATE TRIGGER trg_score_predictions
  AFTER INSERT OR UPDATE OF home_score, away_score, pen_winner, result_outcome
  ON public.fixtures
  FOR EACH ROW
  WHEN (NEW.home_score IS NOT NULL)
  EXECUTE FUNCTION score_predictions_for_fixture();

-- ── 3. Auto-score retroactive predictions ─────────────────────────────────────
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

-- ── 4. Backfill fixtures.tournament_id where NULL ─────────────────────────────
UPDATE public.fixtures f
SET tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'wc2026' LIMIT 1)
WHERE f.tournament_id IS NULL;

-- ── 5. Rescore all existing results ──────────────────────────────────────────
-- Touching home_score fires trg_score_predictions for every fixture with a result
UPDATE public.fixtures SET home_score = home_score WHERE home_score IS NOT NULL;

SELECT 'Migration 069 complete — standard/bonus points split added and all predictions rescored' AS status;
