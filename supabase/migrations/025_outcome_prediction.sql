-- ============================================================
-- Migration 025 — Outcome-only predictions for gs–sf
-- ============================================================

-- Add outcome column to predictions: 'H' | 'D' | 'A' | null (null = exact score round)
ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS outcome text
  CHECK (outcome IN ('H','D','A') OR outcome IS NULL);

-- Add outcome to fixtures for result comparison
ALTER TABLE public.fixtures
  ADD COLUMN IF NOT EXISTS result_outcome text
  CHECK (result_outcome IN ('H','D','A') OR result_outcome IS NULL);

-- Auto-compute result_outcome from scores when result is entered
CREATE OR REPLACE FUNCTION public.set_fixture_outcome()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.home_score IS NOT NULL AND NEW.away_score IS NOT NULL THEN
    NEW.result_outcome :=
      CASE
        WHEN NEW.home_score > NEW.away_score THEN 'H'
        WHEN NEW.away_score > NEW.home_score THEN 'A'
        ELSE 'D'
      END;
  ELSE
    NEW.result_outcome := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fixture_outcome ON public.fixtures;
CREATE TRIGGER trg_fixture_outcome
  BEFORE INSERT OR UPDATE ON public.fixtures
  FOR EACH ROW EXECUTE FUNCTION public.set_fixture_outcome();

-- Backfill result_outcome for already-entered results
UPDATE public.fixtures SET
  result_outcome = CASE
    WHEN home_score > away_score THEN 'H'
    WHEN away_score > home_score THEN 'A'
    WHEN home_score = away_score THEN 'D'
  END
WHERE home_score IS NOT NULL;

-- ── Updated scoring trigger ─────────────────────────────────
-- gs, r32, r16, qf, sf: outcome only
-- tp, f: exact score (existing logic)
CREATE OR REPLACE FUNCTION score_predictions_for_fixture()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  sc_result  smallint;
  sc_exact   smallint;
  is_fav_round boolean;
  is_exact_round boolean;
BEGIN
  -- Points per round
  SELECT
    CASE NEW.round
      WHEN 'gs'  THEN 3  WHEN 'r32' THEN 5  WHEN 'r16' THEN 7
      WHEN 'qf'  THEN 10 WHEN 'sf'  THEN 15 WHEN 'tp'  THEN 5
      WHEN 'f'   THEN 25
    END,
    CASE NEW.round
      WHEN 'gs'  THEN 5  WHEN 'r32' THEN 8  WHEN 'r16' THEN 10
      WHEN 'qf'  THEN 14 WHEN 'sf'  THEN 20 WHEN 'tp'  THEN 10
      WHEN 'f'   THEN 30
    END
  INTO sc_result, sc_exact;

  is_fav_round   := NEW.round IN ('gs', 'r32');
  is_exact_round := NEW.round IN ('tp', 'f');

  UPDATE public.predictions p
  SET points_earned =
    CASE
      WHEN is_exact_round THEN
        -- Exact score rounds (tp, f): compare home/away scores
        CASE
          WHEN p.home = NEW.home_score AND p.away = NEW.away_score THEN
            sc_exact * CASE WHEN is_fav_round AND EXISTS (
              SELECT 1 FROM public.users u WHERE u.id = p.user_id AND u.favourite_team IN (NEW.home, NEW.away)
            ) THEN 2 ELSE 1 END
          WHEN (p.home > p.away) = (NEW.home_score > NEW.away_score)
           AND (p.home < p.away) = (NEW.home_score < NEW.away_score)
           AND (p.home = p.away) = (NEW.home_score = NEW.away_score) THEN
            sc_result * CASE WHEN is_fav_round AND EXISTS (
              SELECT 1 FROM public.users u WHERE u.id = p.user_id AND u.favourite_team IN (NEW.home, NEW.away)
            ) THEN 2 ELSE 1 END
          ELSE 0
        END
      ELSE
        -- Outcome-only rounds (gs, r32, r16, qf, sf): compare outcome column
        CASE
          WHEN p.outcome = NEW.result_outcome THEN
            sc_result * CASE WHEN is_fav_round AND EXISTS (
              SELECT 1 FROM public.users u WHERE u.id = p.user_id AND u.favourite_team IN (NEW.home, NEW.away)
            ) THEN 2 ELSE 1 END
          ELSE 0
        END
    END,
    updated_at = now()
  WHERE p.fixture_id = NEW.id;

  RETURN NEW;
END;
$$;

SELECT 'Migration 025 complete' AS status;

-- ── Addendum: penalty winner for outcome-round knockout draws ──
-- Update scoring trigger to also check pen_winner when outcome='D' in knockout rounds
CREATE OR REPLACE FUNCTION score_predictions_for_fixture()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  sc_result  smallint;
  sc_exact   smallint;
  is_fav_round boolean;
  is_exact_round boolean;
  is_knockout_round boolean;
BEGIN
  SELECT
    CASE NEW.round
      WHEN 'gs'  THEN 3  WHEN 'r32' THEN 5  WHEN 'r16' THEN 7
      WHEN 'qf'  THEN 10 WHEN 'sf'  THEN 15 WHEN 'tp'  THEN 5
      WHEN 'f'   THEN 25
    END,
    CASE NEW.round
      WHEN 'gs'  THEN 5  WHEN 'r32' THEN 8  WHEN 'r16' THEN 10
      WHEN 'qf'  THEN 14 WHEN 'sf'  THEN 20 WHEN 'tp'  THEN 10
      WHEN 'f'   THEN 30
    END
  INTO sc_result, sc_exact;

  is_fav_round      := NEW.round IN ('gs', 'r32');
  is_exact_round    := NEW.round IN ('tp', 'f');
  is_knockout_round := NEW.round IN ('r32','r16','qf','sf','tp','f');

  UPDATE public.predictions p
  SET points_earned =
    CASE
      WHEN is_exact_round THEN
        CASE
          WHEN p.home = NEW.home_score AND p.away = NEW.away_score THEN
            sc_exact * CASE WHEN is_fav_round AND EXISTS (
              SELECT 1 FROM public.users u WHERE u.id = p.user_id AND u.favourite_team IN (NEW.home, NEW.away)
            ) THEN 2 ELSE 1 END
          WHEN (p.home > p.away) = (NEW.home_score > NEW.away_score)
           AND (p.home < p.away) = (NEW.home_score < NEW.away_score)
           AND (p.home = p.away) = (NEW.home_score = NEW.away_score) THEN
            sc_result * CASE WHEN is_fav_round AND EXISTS (
              SELECT 1 FROM public.users u WHERE u.id = p.user_id AND u.favourite_team IN (NEW.home, NEW.away)
            ) THEN 2 ELSE 1 END
          ELSE 0
        END
      ELSE
        -- Outcome-only rounds: check outcome match
        -- For knockout draws, also check pen_winner
        CASE
          WHEN p.outcome = NEW.result_outcome THEN
            CASE
              WHEN is_knockout_round AND NEW.result_outcome = 'D' AND NEW.pen_winner IS NOT NULL THEN
                -- Correct pen winner = full points; wrong = correct result points
                CASE WHEN p.pen_winner = NEW.pen_winner THEN sc_result ELSE sc_result END
                -- (same points either way for outcome rounds — pen_winner is a tiebreaker only)
                * CASE WHEN is_fav_round AND EXISTS (
                    SELECT 1 FROM public.users u WHERE u.id = p.user_id AND u.favourite_team IN (NEW.home, NEW.away)
                  ) THEN 2 ELSE 1 END
              ELSE
                sc_result * CASE WHEN is_fav_round AND EXISTS (
                  SELECT 1 FROM public.users u WHERE u.id = p.user_id AND u.favourite_team IN (NEW.home, NEW.away)
                ) THEN 2 ELSE 1 END
            END
          ELSE 0
        END
    END,
    updated_at = now()
  WHERE p.fixture_id = NEW.id;

  RETURN NEW;
END;
$$;

-- ── Addendum: sf is now an exact-score round ──────────────────────────────
-- Update is_exact_round in the scoring trigger to include sf
CREATE OR REPLACE FUNCTION score_predictions_for_fixture()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  sc_result  smallint;
  sc_exact   smallint;
  is_fav_round boolean;
  is_exact_round boolean;
  is_knockout_round boolean;
BEGIN
  SELECT
    CASE NEW.round
      WHEN 'gs'  THEN 3  WHEN 'r32' THEN 5  WHEN 'r16' THEN 7
      WHEN 'qf'  THEN 10 WHEN 'sf'  THEN 15 WHEN 'tp'  THEN 5
      WHEN 'f'   THEN 25
    END,
    CASE NEW.round
      WHEN 'gs'  THEN 5  WHEN 'r32' THEN 8  WHEN 'r16' THEN 10
      WHEN 'qf'  THEN 14 WHEN 'sf'  THEN 20 WHEN 'tp'  THEN 10
      WHEN 'f'   THEN 30
    END
  INTO sc_result, sc_exact;

  is_fav_round      := NEW.round IN ('gs', 'r32');
  is_exact_round    := NEW.round IN ('sf', 'tp', 'f');
  is_knockout_round := NEW.round IN ('r32','r16','qf','sf','tp','f');

  UPDATE public.predictions p
  SET points_earned =
    CASE
      WHEN is_exact_round THEN
        CASE
          WHEN p.home = NEW.home_score AND p.away = NEW.away_score THEN
            sc_exact * CASE WHEN is_fav_round AND EXISTS (
              SELECT 1 FROM public.users u WHERE u.id = p.user_id AND u.favourite_team IN (NEW.home, NEW.away)
            ) THEN 2 ELSE 1 END
          WHEN (p.home > p.away) = (NEW.home_score > NEW.away_score)
           AND (p.home < p.away) = (NEW.home_score < NEW.away_score)
           AND (p.home = p.away) = (NEW.home_score = NEW.away_score) THEN
            sc_result * CASE WHEN is_fav_round AND EXISTS (
              SELECT 1 FROM public.users u WHERE u.id = p.user_id AND u.favourite_team IN (NEW.home, NEW.away)
            ) THEN 2 ELSE 1 END
          ELSE 0
        END
      ELSE
        CASE
          WHEN p.outcome = NEW.result_outcome THEN
            CASE
              WHEN is_knockout_round AND NEW.result_outcome = 'D' AND NEW.pen_winner IS NOT NULL THEN
                sc_result * CASE WHEN is_fav_round AND EXISTS (
                    SELECT 1 FROM public.users u WHERE u.id = p.user_id AND u.favourite_team IN (NEW.home, NEW.away)
                  ) THEN 2 ELSE 1 END
              ELSE
                sc_result * CASE WHEN is_fav_round AND EXISTS (
                  SELECT 1 FROM public.users u WHERE u.id = p.user_id AND u.favourite_team IN (NEW.home, NEW.away)
                ) THEN 2 ELSE 1 END
            END
          ELSE 0
        END
    END,
    updated_at = now()
  WHERE p.fixture_id = NEW.id;

  RETURN NEW;
END;
$$;

SELECT 'sf added to exact score rounds' AS status;
