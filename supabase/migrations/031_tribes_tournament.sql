-- Migration 031 — link tribes to tournament

ALTER TABLE public.tribes
  ADD COLUMN IF NOT EXISTS tournament_id uuid
  REFERENCES public.tournaments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tribes_tournament ON public.tribes(tournament_id);

-- Tag all existing tribes as WC2026
UPDATE public.tribes
SET tournament_id = (
  SELECT id FROM public.tournaments WHERE slug = 'wc2026' LIMIT 1
)
WHERE tournament_id IS NULL;

-- Update tribe-leaderboard materialized view to include tournament_id from tribes
-- (leaderboard already has tournament_id from predictions, tribes now have it too)

SELECT t.name, tr.name as tribe, tr.tournament_id
FROM public.tribes tr
LEFT JOIN public.tournaments t ON t.id = tr.tournament_id
LIMIT 10;

SELECT 'Migration 031 complete' AS status;

-- ── Updated scoring trigger: exact = result + 5 bonus (not separate sc_exact) ──
CREATE OR REPLACE FUNCTION score_predictions_for_fixture()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  sc_result         smallint;
  is_fav_round      boolean;
  is_exact_round    boolean;
  is_knockout_round boolean;
BEGIN
  sc_result := CASE NEW.round
    WHEN 'gs'  THEN 3  WHEN 'r32' THEN 5  WHEN 'r16' THEN 7
    WHEN 'qf'  THEN 10 WHEN 'sf'  THEN 15 WHEN 'tp'  THEN 5
    WHEN 'f'   THEN 25 ELSE 0
  END;

  is_fav_round      := NEW.round IN ('gs','r32');
  is_exact_round    := NEW.round IN ('sf','tp','f');
  is_knockout_round := NEW.round IN ('r32','r16','qf','sf','tp','f');

  UPDATE public.predictions p
  SET points_earned = (
    CASE
      WHEN is_exact_round THEN
        -- Correct exact score = result_pts + 5 bonus; correct result only = result_pts
        CASE
          WHEN p.home = NEW.home_score AND p.away = NEW.away_score THEN sc_result + 5
          WHEN (CASE WHEN p.home>p.away THEN 'H' WHEN p.away>p.home THEN 'A' ELSE 'D' END)
             = (CASE WHEN NEW.home_score>NEW.away_score THEN 'H' WHEN NEW.away_score>NEW.home_score THEN 'A' ELSE 'D' END)
          THEN sc_result
          ELSE 0
        END
      ELSE
        -- Outcome rounds: result_pts (+ 5 pen bonus if correct pen winner)
        CASE
          WHEN p.outcome = NEW.result_outcome THEN
            sc_result + CASE
              WHEN is_knockout_round
                AND NEW.result_outcome = 'D'
                AND NEW.pen_winner IS NOT NULL
                AND p.pen_winner = NEW.pen_winner
              THEN 5 ELSE 0
            END
          ELSE 0
        END
    END
  ) * (
    CASE WHEN is_fav_round AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = p.user_id AND u.favourite_team IN (NEW.home, NEW.away)
    ) THEN 2 ELSE 1 END
  ),
  updated_at = now()
  WHERE p.fixture_id = NEW.id;

  REFRESH MATERIALIZED VIEW CONCURRENTLY public.leaderboard;

  RETURN NEW;
END;
$$;
