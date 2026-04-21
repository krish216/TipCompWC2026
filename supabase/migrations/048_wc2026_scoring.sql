-- Migration 048 — scoring trigger reads from tournaments.scoring_config
-- Falls back to hardcoded WC2026 values if config is missing.
-- Run AFTER migration 049 (which adds the scoring_config column).

CREATE OR REPLACE FUNCTION score_predictions_for_fixture()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  cfg            jsonb;
  round_cfg      jsonb;
  sc_result      smallint;
  sc_exact_total smallint;   -- result_pts + exact_bonus
  pen_bonus_pts  smallint;
  is_fav_round   boolean;
  is_score_round boolean;    -- predict_mode = 'score'
  has_pen_bonus  boolean;
BEGIN
  -- Load scoring config for this tournament
  SELECT scoring_config INTO cfg
  FROM public.tournaments WHERE id = NEW.tournament_id;

  IF cfg IS NOT NULL AND cfg->'rounds' ? NEW.round THEN
    round_cfg      := cfg->'rounds'->NEW.round;
    sc_result      := (round_cfg->>'result_pts')::smallint;
    sc_exact_total := sc_result + COALESCE((round_cfg->>'exact_bonus')::smallint, 0);
    pen_bonus_pts  := COALESCE((round_cfg->>'pen_bonus')::smallint, 0);
    is_fav_round   := (round_cfg->>'fav_team_2x')::boolean;
    is_score_round := (round_cfg->>'predict_mode') = 'score';
    has_pen_bonus  := pen_bonus_pts > 0;
  ELSE
    -- Hardcoded WC2026 fallback
    SELECT
      CASE NEW.round WHEN 'gs' THEN 3 WHEN 'r32' THEN 5 WHEN 'r16' THEN 7
        WHEN 'qf' THEN 10 WHEN 'sf' THEN 15 WHEN 'tp' THEN 5 WHEN 'f' THEN 25 END,
      CASE NEW.round WHEN 'sf' THEN 20 WHEN 'tp' THEN 10 WHEN 'f' THEN 30 ELSE NULL END,
      CASE NEW.round WHEN 'r16' THEN 5 WHEN 'qf' THEN 5 WHEN 'sf' THEN 5 WHEN 'tp' THEN 5 WHEN 'f' THEN 5 ELSE 0 END
    INTO sc_result, sc_exact_total, pen_bonus_pts;
    is_fav_round   := NEW.round IN ('gs', 'r32');
    is_score_round := NEW.round IN ('sf', 'tp', 'f');
    has_pen_bonus  := NEW.round IN ('r16', 'qf', 'sf', 'tp', 'f');
  END IF;

  UPDATE public.predictions p
  SET points_earned = (
    CASE
      -- Score-prediction rounds (sf, tp, f): exact score earns extra bonus
      WHEN is_score_round THEN
        CASE
          WHEN p.home = NEW.home_score AND p.away = NEW.away_score
            THEN sc_exact_total
          WHEN (CASE WHEN p.home > p.away THEN 'H' WHEN p.away > p.home THEN 'A' ELSE 'D' END)
             = (CASE WHEN NEW.home_score > NEW.away_score THEN 'H' WHEN NEW.away_score > NEW.home_score THEN 'A' ELSE 'D' END)
            THEN sc_result
              + CASE
                  WHEN has_pen_bonus
                    AND NEW.home_score = NEW.away_score
                    AND NEW.pen_winner IS NOT NULL
                    AND p.pen_winner = NEW.pen_winner
                  THEN pen_bonus_pts ELSE 0
                END
          ELSE 0
        END

      -- Outcome rounds (gs, r32, r16, qf): pick H/D/A
      ELSE
        CASE
          WHEN p.outcome = NEW.result_outcome
            THEN sc_result
              + CASE
                  WHEN has_pen_bonus
                    AND NEW.result_outcome = 'D'
                    AND NEW.pen_winner IS NOT NULL
                    AND p.pen_winner = NEW.pen_winner
                  THEN pen_bonus_pts ELSE 0
                END
          ELSE 0
        END
    END
  ) * (
    CASE
      WHEN is_fav_round AND EXISTS (
        SELECT 1 FROM public.user_tournaments ut
        WHERE ut.user_id = p.user_id
          AND ut.tournament_id = NEW.tournament_id
          AND ut.favourite_team IN (NEW.home, NEW.away)
      ) THEN 2 ELSE 1
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

-- Re-score all existing results
UPDATE public.fixtures SET home_score = home_score WHERE home_score IS NOT NULL;

REFRESH MATERIALIZED VIEW public.leaderboard;

SELECT 'Migration 048 complete — scoring trigger reads tournaments.scoring_config' AS status;
