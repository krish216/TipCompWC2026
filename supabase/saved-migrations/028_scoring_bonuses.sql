-- Migration 028 — scoring bonuses
-- 1. +5 penalty bonus for correct penalty winner on draw (r32 onwards)
-- 2. +5 exact bonus for correct exact score (sf onwards) — on top of result points
-- 3. active_tournament_id on users table (current tournament)

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS active_tournament_id uuid REFERENCES public.tournaments(id) ON DELETE SET NULL;

-- Set existing users' active tournament to their enrolled tournament
UPDATE public.users u
SET active_tournament_id = ut.tournament_id
FROM public.user_tournaments ut
WHERE ut.user_id = u.id
AND u.active_tournament_id IS NULL;

-- Updated scoring trigger with bonuses
CREATE OR REPLACE FUNCTION score_predictions_for_fixture()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  sc_result         smallint;
  sc_exact          smallint;
  is_fav_round      boolean;
  is_exact_round    boolean;
  is_knockout_round boolean;
  has_pen_bonus     boolean;  -- r32 onwards: +5 for correct pen winner
  has_exact_bonus   boolean;  -- sf onwards: +5 for exact score on top of result pts
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

  is_fav_round      := NEW.round IN ('gs','r32');
  is_exact_round    := NEW.round IN ('sf','tp','f');
  is_knockout_round := NEW.round IN ('r32','r16','qf','sf','tp','f');
  has_pen_bonus     := NEW.round IN ('r32','r16','qf','sf','tp','f');  -- r32+
  has_exact_bonus   := NEW.round IN ('sf','tp','f');                   -- sf+

  UPDATE public.predictions p
  SET points_earned = (
    CASE
      WHEN is_exact_round THEN
        -- Exact score rounds: compare home/away
        CASE
          WHEN p.home = NEW.home_score AND p.away = NEW.away_score THEN
            -- Correct exact score
            sc_exact
          WHEN (CASE WHEN p.home > p.away THEN 'H' WHEN p.away > p.home THEN 'A' ELSE 'D' END)
             = (CASE WHEN NEW.home_score > NEW.away_score THEN 'H' WHEN NEW.away_score > NEW.home_score THEN 'A' ELSE 'D' END)
          THEN
            -- Correct result but wrong score
            sc_result
            + CASE WHEN has_exact_bonus THEN 0 ELSE 0 END  -- no extra for just correct result in sf+
          ELSE 0
        END
      ELSE
        -- Outcome-only rounds: compare outcome column
        CASE
          WHEN p.outcome = NEW.result_outcome THEN
            sc_result
            + CASE
                WHEN has_pen_bonus
                  AND NEW.result_outcome = 'D'
                  AND NEW.pen_winner IS NOT NULL
                  AND p.pen_winner = NEW.pen_winner
                THEN 5  -- +5 pen bonus
                ELSE 0
              END
          ELSE 0
        END
    END
  ) * (
    CASE WHEN is_fav_round AND EXISTS (
      SELECT 1 FROM public.users u WHERE u.id = p.user_id
        AND u.favourite_team IN (NEW.home, NEW.away)
    ) THEN 2 ELSE 1 END
  ),
  updated_at = now()
  WHERE p.fixture_id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_score_predictions ON public.fixtures;
CREATE TRIGGER trg_score_predictions
  AFTER INSERT OR UPDATE OF home_score, away_score, pen_winner ON public.fixtures
  FOR EACH ROW
  WHEN (NEW.home_score IS NOT NULL)
  EXECUTE FUNCTION score_predictions_for_fixture();

SELECT 'Migration 028 complete' AS status;
