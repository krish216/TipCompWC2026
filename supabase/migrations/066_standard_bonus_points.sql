-- Migration 066 — split points_earned into standard_points + bonus_points
--
-- standard_points: points for correct result (H/D/A), no multipliers or bonuses
-- bonus_points:    exact score extra + pen winner extra + fav-team 2× extra
-- points_earned:   standard_points + bonus_points  (kept for backward compat)
--
-- Fav-team 2× rule: the extra gained from doubling goes into bonus_points,
-- keeping standard_points a pure measure of prediction accuracy.

-- ── 1. Add columns ────────────────────────────────────────────────────────────
ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS standard_points int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonus_points    int NOT NULL DEFAULT 0;

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

  -- Compute per-prediction using a CTE so we only write each expression once.
  -- std      = result_pts when correct result, else 0
  -- exact_e  = exact_bonus when exact scoreline predicted (score rounds only)
  -- pen_e    = pen_bonus when pen winner predicted correctly
  -- has_fav  = true when fav_team_2x applies for this player
  --
  -- bonus_points = exact_e + pen_e + CASE has_fav THEN (std+exact_e+pen_e) END
  -- points_earned = std + bonus_points
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
            -- score mode: draw in regular time → pens
            (rc.predict_mode = 'score'
              AND NEW.home_score = NEW.away_score
              AND (CASE WHEN p.home > p.away THEN 'H' WHEN p.away > p.home THEN 'A' ELSE 'D' END)
                = (CASE WHEN NEW.home_score > NEW.away_score THEN 'H' WHEN NEW.away_score > NEW.home_score THEN 'A' ELSE 'D' END))
            OR
            -- outcome mode: predicted draw and result is draw
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

-- ── 3. Rescore all existing results ─────────────────────────────────────────
UPDATE public.fixtures SET home_score = home_score WHERE home_score IS NOT NULL;

-- ── 4. Rebuild leaderboard materialized view ─────────────────────────────────
DROP MATERIALIZED VIEW IF EXISTS public.leaderboard CASCADE;

CREATE MATERIALIZED VIEW public.leaderboard AS
SELECT
  p.user_id,
  p.tournament_id,
  u.display_name,
  tm.tribe_id,
  t.name                                              AS tribe_name,
  up.comp_id,
  c.name                                              AS comp_name,
  COALESCE(SUM(p.points_earned),    0)::int           AS total_points,
  COALESCE(SUM(p.bonus_points),     0)::int           AS total_bonus_points,
  COUNT(*) FILTER (WHERE p.bonus_points    > 0)::int  AS bonus_count,
  COUNT(*) FILTER (WHERE p.standard_points > 0)::int  AS correct_count,
  COUNT(*) FILTER (WHERE p.points_earned IS NOT NULL)::int AS predictions_made
FROM  public.predictions    p
JOIN  public.users          u   ON u.id  = p.user_id
JOIN  public.fixtures       f   ON f.id  = p.fixture_id
LEFT JOIN public.user_preferences up ON up.user_id = p.user_id
LEFT JOIN public.comps      c   ON c.id  = up.comp_id
LEFT JOIN public.tribe_members tm ON tm.user_id = p.user_id
LEFT JOIN public.tribes     t   ON t.id  = tm.tribe_id
WHERE p.points_earned IS NOT NULL
GROUP BY
  p.user_id, p.tournament_id, u.display_name,
  tm.tribe_id, t.name, up.comp_id, c.name;

CREATE UNIQUE INDEX leaderboard_user_tournament
  ON public.leaderboard (user_id, tournament_id);
CREATE INDEX leaderboard_tournament
  ON public.leaderboard (tournament_id, total_points DESC);

REFRESH MATERIALIZED VIEW public.leaderboard;

SELECT 'Migration 066 complete — standard_points and bonus_points added' AS status;
