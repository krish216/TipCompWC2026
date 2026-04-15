-- Migration 038 — tournament metadata for banner + stats display

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS total_matches   int,
  ADD COLUMN IF NOT EXISTS total_teams     int,
  ADD COLUMN IF NOT EXISTS total_rounds    int,
  ADD COLUMN IF NOT EXISTS kickoff_venue   text,      -- e.g. "Estadio Azteca, Mexico City"
  ADD COLUMN IF NOT EXISTS final_venue     text,      -- e.g. "MetLife Stadium, New York/NJ"
  ADD COLUMN IF NOT EXISTS final_date      date,      -- e.g. 2026-07-19
  ADD COLUMN IF NOT EXISTS first_match     text;      -- e.g. "Mexico vs South Africa · Estadio Azteca · Jun 11"

-- Seed WC2026 metadata
UPDATE public.tournaments
SET
  total_matches  = 104,
  total_teams    = 48,
  total_rounds   = 7,
  kickoff_venue  = 'Estadio Azteca, Mexico City',
  final_venue    = 'MetLife Stadium, New York/NJ',
  final_date     = '2026-07-19',
  first_match    = 'Mexico vs South Africa · Estadio Azteca · Jun 11'
WHERE slug = 'wc2026';

SELECT name, total_matches, total_teams, kickoff_venue, final_venue, final_date
FROM public.tournaments;

SELECT 'Migration 038 complete' AS status;
