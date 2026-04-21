-- Migration 049 — tournament_rounds table
-- Replaces scoring_config jsonb with a proper normalised table.
-- One row per round per tournament. The scoring trigger and app both
-- read from this table — single source of truth, no duplication.

-- Drop the jsonb column added in the previous (abandoned) approach
ALTER TABLE public.tournaments DROP COLUMN IF EXISTS scoring_config;

CREATE TABLE IF NOT EXISTS public.tournament_rounds (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id  uuid        NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  round_code     text        NOT NULL,   -- 'gs','r32','r16','qf','sf','tp','f'
  round_name     text        NOT NULL,   -- 'Group Stage', 'Round of 32', etc.
  round_order    int         NOT NULL,   -- 1..N, used for sorting / tab display
  predict_mode   text        NOT NULL DEFAULT 'outcome' CHECK (predict_mode IN ('outcome','score')),
  result_pts     int         NOT NULL DEFAULT 0,   -- pts for correct outcome
  exact_bonus    int         NOT NULL DEFAULT 0,   -- extra pts when exact score predicted
  pen_bonus      int         NOT NULL DEFAULT 0,   -- extra pts when pen winner correct
  fav_team_2x    boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tournament_rounds_unique UNIQUE (tournament_id, round_code)
);

-- Index for trigger performance (joins on tournament_id + round_code)
CREATE INDEX IF NOT EXISTS tournament_rounds_tourn_round
  ON public.tournament_rounds (tournament_id, round_code);

-- RLS — public read so app can load without auth; writes restricted to service role
ALTER TABLE public.tournament_rounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tournament_rounds_public_read"
  ON public.tournament_rounds FOR SELECT USING (true);

-- ── Seed WC2026 rounds ──────────────────────────────────────────────────────
-- Confirmed from tournament rules (screenshot, Apr 2026)

INSERT INTO public.tournament_rounds
  (tournament_id, round_code, round_name,       round_order, predict_mode, result_pts, exact_bonus, pen_bonus, fav_team_2x)
SELECT
  t.id, v.round_code, v.round_name, v.round_order, v.predict_mode,
  v.result_pts, v.exact_bonus, v.pen_bonus, v.fav_team_2x
FROM public.tournaments t
CROSS JOIN (VALUES
  ('gs',  'Group Stage',    1, 'outcome',  3,  0, 0, true ),
  ('r32', 'Round of 32',   2, 'outcome',  5,  0, 5, true ),
  ('r16', 'Round of 16',   3, 'outcome',  7,  0, 5, false),
  ('qf',  'Quarter-finals',4, 'outcome', 10,  0, 5, false),
  ('sf',  'Semi-finals',   5, 'score',   15,  5, 5, false),
  ('tp',  '3rd Place',     6, 'score',    5,  5, 5, false),
  ('f',   'Final',         7, 'score',   25,  5, 5, false)
) AS v(round_code, round_name, round_order, predict_mode, result_pts, exact_bonus, pen_bonus, fav_team_2x)
WHERE t.slug = 'wc2026'
ON CONFLICT (tournament_id, round_code) DO UPDATE SET
  round_name   = EXCLUDED.round_name,
  round_order  = EXCLUDED.round_order,
  predict_mode = EXCLUDED.predict_mode,
  result_pts   = EXCLUDED.result_pts,
  exact_bonus  = EXCLUDED.exact_bonus,
  pen_bonus    = EXCLUDED.pen_bonus,
  fav_team_2x  = EXCLUDED.fav_team_2x;

-- Verify
SELECT round_code, round_name, result_pts, exact_bonus, pen_bonus, fav_team_2x
FROM public.tournament_rounds tr
JOIN public.tournaments t ON t.id = tr.tournament_id
WHERE t.slug = 'wc2026'
ORDER BY round_order;

SELECT 'Migration 049 complete — tournament_rounds table created and WC2026 seeded' AS status;
