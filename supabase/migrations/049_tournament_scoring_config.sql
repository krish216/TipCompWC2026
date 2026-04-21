-- Migration 049 — per-tournament scoring configuration
-- Adds scoring_config jsonb to tournaments so each tournament can define
-- its own round structure, point values, and bonus rules.
-- The app reads this at runtime; falls back to hardcoded SCORING if null.

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS scoring_config jsonb DEFAULT NULL;

COMMENT ON COLUMN public.tournaments.scoring_config IS
  'Per-tournament scoring rules. JSON shape:
   {
     "rounds": {
       "<roundId>": {
         "label":        string,   -- display name
         "result_pts":   number,   -- pts for correct outcome
         "exact_bonus":  number,   -- extra pts for exact score (0 if not applicable)
         "pen_bonus":    number,   -- extra pts for correct pen winner (0 if not applicable)
         "fav_team_2x":  boolean,  -- whether favourite team double applies
         "predict_mode": "outcome" | "score"  -- outcome = H/D/A, score = exact scoreline
       }
     },
     "exact_score_rounds":  [roundId, ...],  -- rounds requiring score prediction
     "pen_bonus_rounds":    [roundId, ...],  -- rounds with pen winner bonus
     "fav_team_rounds":     [roundId, ...]   -- rounds with 2x fav team multiplier
   }';

-- Seed WC2026 scoring config (confirmed from tournament rules)
UPDATE public.tournaments
SET scoring_config = '{
  "rounds": {
    "gs":  { "label": "Group Stage",    "result_pts":  3, "exact_bonus": 0, "pen_bonus": 0, "fav_team_2x": true,  "predict_mode": "outcome" },
    "r32": { "label": "Round of 32",    "result_pts":  5, "exact_bonus": 0, "pen_bonus": 0, "fav_team_2x": true,  "predict_mode": "outcome" },
    "r16": { "label": "Round of 16",    "result_pts":  7, "exact_bonus": 0, "pen_bonus": 5, "fav_team_2x": false, "predict_mode": "outcome" },
    "qf":  { "label": "Quarter-finals", "result_pts": 10, "exact_bonus": 0, "pen_bonus": 5, "fav_team_2x": false, "predict_mode": "outcome" },
    "sf":  { "label": "Semi-finals",    "result_pts": 15, "exact_bonus": 5, "pen_bonus": 5, "fav_team_2x": false, "predict_mode": "score"   },
    "tp":  { "label": "3rd Place",      "result_pts":  5, "exact_bonus": 5, "pen_bonus": 5, "fav_team_2x": false, "predict_mode": "score"   },
    "f":   { "label": "Final",          "result_pts": 25, "exact_bonus": 5, "pen_bonus": 5, "fav_team_2x": false, "predict_mode": "score"   }
  },
  "exact_score_rounds": ["sf", "tp", "f"],
  "pen_bonus_rounds":   ["r16", "qf", "sf", "tp", "f"],
  "fav_team_rounds":    ["gs", "r32"]
}'::jsonb
WHERE slug = 'wc2026';

SELECT
  name,
  scoring_config->'rounds'->'f'->>'result_pts'  AS final_result_pts,
  scoring_config->'rounds'->'tp'->>'result_pts' AS tp_result_pts,
  scoring_config->>'pen_bonus_rounds'            AS pen_bonus_rounds
FROM public.tournaments
WHERE slug = 'wc2026';

SELECT 'Migration 049 complete — WC2026 scoring_config seeded' AS status;
