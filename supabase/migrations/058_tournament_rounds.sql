-- ============================================================
-- Migration 058 — Tournament-specific round configurations
-- ============================================================

-- Create tournament_rounds table for dynamic round configuration
CREATE TABLE IF NOT EXISTS public.tournament_rounds (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id   uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  round_code      text NOT NULL,                    -- 'gs', 'r32', 'r16', 'qf', 'sf', 'tp', 'f', etc.
  round_name      text NOT NULL,                    -- 'Group Stage', 'Round of 32', etc.
  round_order     int NOT NULL,                     -- 1, 2, 3... for ordering
  tab_group       text NOT NULL,                    -- UI tab this round belongs to
  tab_label       text,                             -- optional override for tab display label
  is_knockout     boolean NOT NULL DEFAULT false,   -- single-elimination format
  predict_mode    text NOT NULL DEFAULT 'outcome'  -- 'outcome' (H/D/A) or 'score' (exact goals)
    CHECK (predict_mode IN ('outcome', 'score')),
  result_pts      int NOT NULL DEFAULT 0,           -- points for correct outcome/score
  exact_bonus     int NOT NULL DEFAULT 0,           -- bonus for exact score (only if predict_mode='score')
  pen_bonus       int NOT NULL DEFAULT 0,           -- bonus for correct penalty winners (knockout only)
  fav_team_2x     boolean NOT NULL DEFAULT false,   -- double points if favourite team involved
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  
  UNIQUE (tournament_id, round_code)
);

-- Enable RLS
ALTER TABLE public.tournament_rounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tournament_rounds_public_read" ON public.tournament_rounds FOR SELECT USING (true);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_tournament_rounds_tournament_order
  ON public.tournament_rounds(tournament_id, round_order);
CREATE INDEX IF NOT EXISTS idx_tournament_rounds_round_code
  ON public.tournament_rounds(tournament_id, round_code);
CREATE INDEX IF NOT EXISTS idx_tournament_rounds_tab_group
  ON public.tournament_rounds(tournament_id, tab_group);

-- Seed WC2026 rounds (migration 049 equivalent)
INSERT INTO public.tournament_rounds (
  tournament_id, round_code, round_name, round_order, tab_group, tab_label,
  is_knockout, predict_mode, result_pts, exact_bonus, pen_bonus, fav_team_2x
)
SELECT
  t.id, r.round_code, r.round_name, r.round_order, r.tab_group, r.tab_label,
  r.is_knockout, r.predict_mode, r.result_pts, r.exact_bonus, r.pen_bonus, r.fav_team_2x
FROM public.tournaments t
CROSS JOIN (
  VALUES
    ('gs',  'Group Stage',    1, 'gs',     NULL, false, 'outcome', 3,  0, 0, true),
    ('r32', 'Round of 32',    2, 'r32',    NULL, true,  'outcome', 5,  0, 5, true),
    ('r16', 'Round of 16',    3, 'r16',    NULL, true,  'outcome', 7,  0, 5, false),
    ('qf',  'Quarter-finals', 4, 'qf',     NULL, true,  'outcome', 10, 0, 5, false),
    ('sf',  'Semi-finals',    5, 'sf',     NULL, true,  'score',   15, 5, 5, false),
    ('tp',  '3rd Place',      6, 'finals', NULL, true,  'score',   5,  5, 5, false),
    ('f',   'Final',          7, 'finals', NULL, true,  'score',   25, 5, 5, false)
) r(round_code, round_name, round_order, tab_group, tab_label, is_knockout, predict_mode, result_pts, exact_bonus, pen_bonus, fav_team_2x)
WHERE t.slug = 'wc2026'
ON CONFLICT (tournament_id, round_code) DO UPDATE SET
  round_name  = EXCLUDED.round_name,
  round_order = EXCLUDED.round_order,
  tab_group   = EXCLUDED.tab_group,
  is_knockout = EXCLUDED.is_knockout,
  predict_mode= EXCLUDED.predict_mode,
  result_pts  = EXCLUDED.result_pts,
  exact_bonus = EXCLUDED.exact_bonus,
  pen_bonus   = EXCLUDED.pen_bonus,
  fav_team_2x = EXCLUDED.fav_team_2x;

-- Verify seeding
SELECT t.name, COUNT(tr.id) as round_count
FROM public.tournaments t
LEFT JOIN public.tournament_rounds tr ON tr.tournament_id = t.id
WHERE t.slug = 'wc2026'
GROUP BY t.id, t.name;

SELECT 'Migration 058 complete' AS status;
