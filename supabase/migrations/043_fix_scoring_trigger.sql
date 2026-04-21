-- Migration 043 — fix scoring trigger to use user_tournaments.favourite_team
-- The trigger was reading users.favourite_team (now dropped).
-- It must now join user_tournaments on (user_id, tournament_id) to get the
-- per-tournament favourite team.

CREATE OR REPLACE FUNCTION score_predictions_for_fixture()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  sc_result         smallint;
  sc_exact          smallint;
  is_fav_round      boolean;
  is_exact_round    boolean;
  has_pen_bonus     boolean;
BEGIN
  -- Base points for this round
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
  is_exact_round := NEW.round IN ('sf', 'tp', 'f');
  has_pen_bonus  := NEW.round IN ('r32', 'r16', 'qf', 'sf', 'tp', 'f');

  UPDATE public.predictions p
  SET points_earned = (
    CASE
      -- ── Exact-score rounds (sf, tp, f) ─────────────────────────────────
      WHEN is_exact_round THEN
        CASE
          WHEN p.home = NEW.home_score AND p.away = NEW.away_score
            THEN sc_exact                     -- exact score = result pts + 5 bonus
          WHEN (CASE WHEN p.home  > p.away  THEN 'H'
                     WHEN p.away  > p.home  THEN 'A' ELSE 'D' END)
             = (CASE WHEN NEW.home_score > NEW.away_score THEN 'H'
                     WHEN NEW.away_score > NEW.home_score THEN 'A' ELSE 'D' END)
            THEN sc_result                    -- correct result only
          ELSE 0
        END

      -- ── Outcome-only rounds (gs, r32, r16, qf) ─────────────────────────
      ELSE
        CASE
          WHEN p.outcome = NEW.result_outcome THEN
            sc_result
            + CASE
                WHEN has_pen_bonus
                  AND NEW.result_outcome = 'D'
                  AND NEW.pen_winner IS NOT NULL
                  AND p.pen_winner = NEW.pen_winner
                THEN 5   -- +5 pen bonus for correct penalty winner
                ELSE 0
              END
          ELSE 0
        END
    END
  ) * (
    -- ── Double points multiplier for favourite team (gs + r32 only) ──────
    CASE
      WHEN is_fav_round AND EXISTS (
        SELECT 1
        FROM public.user_tournaments ut
        WHERE ut.user_id       = p.user_id
          AND ut.tournament_id = NEW.tournament_id
          AND ut.favourite_team IN (NEW.home, NEW.away)
      ) THEN 2
      ELSE 1
    END
  ),
  updated_at = now()
  WHERE p.fixture_id = NEW.id;

  RETURN NEW;
END;
$$;

-- Re-attach trigger (DROP + CREATE to ensure clean state)
DROP TRIGGER IF EXISTS trg_score_predictions ON public.fixtures;
CREATE TRIGGER trg_score_predictions
  AFTER INSERT OR UPDATE OF home_score, away_score, pen_winner, result_outcome
  ON public.fixtures
  FOR EACH ROW
  WHEN (NEW.home_score IS NOT NULL)
  EXECUTE FUNCTION score_predictions_for_fixture();

-- Re-score all fixtures that already have results
-- Touch home_score to re-fire the trigger (no updated_at column on fixtures)
UPDATE public.fixtures
SET home_score = home_score
WHERE home_score IS NOT NULL;

REFRESH MATERIALIZED VIEW public.leaderboard;

SELECT 'Migration 043 complete — scoring trigger fixed, predictions re-scored' AS status;
