-- Migration 058: Seed demo_fixtures + AI-generated demo_results
-- Run AFTER migration 057 (demo tables).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Step 1: Copy GS fixtures → demo_fixtures ─────────────────────────────────
-- Uses WHERE NOT EXISTS to avoid duplicates (no unique constraint on real_fixture_id)

INSERT INTO public.demo_fixtures
  (real_fixture_id, tournament_id, round, grp, home, away, kickoff_utc, venue)
SELECT
  f.id, f.tournament_id, 'gs', f.grp, f.home, f.away, f.kickoff_utc, f.venue
FROM public.fixtures f
WHERE f.round = 'gs'
  AND NOT EXISTS (
    SELECT 1 FROM public.demo_fixtures df WHERE df.real_fixture_id = f.id
  );

-- ── Step 2: Insert AI-generated results ──────────────────────────────────────
-- Keyed by home+away team name match to demo_fixture id.
-- ON CONFLICT on demo_results.demo_fixture_id (has UNIQUE constraint from migration 057).

INSERT INTO public.demo_results (demo_fixture_id, home_score, away_score, result_outcome, generated_at)
SELECT
  df.id,
  r.home_score::int,
  r.away_score::int,
  CASE WHEN r.home_score::int > r.away_score::int THEN 'H'
       WHEN r.away_score::int > r.home_score::int THEN 'A'
       ELSE 'D' END,
  now()
FROM (VALUES
  -- Group A: USA, Mexico, Czechia, Honduras
  ('USA',                    'Honduras',              2, 0),
  ('Mexico',                 'Czechia',               1, 1),
  ('USA',                    'Czechia',               1, 0),
  ('Mexico',                 'Honduras',              3, 1),
  ('USA',                    'Mexico',                2, 2),
  ('Czechia',                'Honduras',              2, 1),
  -- Group B: Canada, Spain, Bosnia and Herzegovina, Chile
  ('Spain',                  'Bosnia and Herzegovina',3, 0),
  ('Canada',                 'Chile',                 1, 1),
  ('Spain',                  'Chile',                 2, 1),
  ('Canada',                 'Bosnia and Herzegovina',2, 0),
  ('Spain',                  'Canada',                1, 0),
  ('Bosnia and Herzegovina', 'Chile',                 1, 2),
  -- Group C: Argentina, Australia, Saudi Arabia, Thailand
  ('Argentina',              'Saudi Arabia',          3, 0),
  ('Australia',              'Thailand',              2, 0),
  ('Argentina',              'Thailand',              4, 0),
  ('Australia',              'Saudi Arabia',          1, 1),
  ('Argentina',              'Australia',             2, 1),
  ('Saudi Arabia',           'Thailand',              2, 1),
  -- Group D: France, Turkey, England, Senegal
  ('France',                 'Senegal',               2, 1),
  ('England',                'Turkey',                1, 1),
  ('France',                 'Turkey',                3, 1),
  ('England',                'Senegal',               2, 0),
  ('France',                 'England',               1, 1),
  ('Turkey',                 'Senegal',               1, 0),
  -- Group E: Brazil, Japan, Ivory Coast, Curacao
  ('Brazil',                 'Curacao',               4, 0),
  ('Japan',                  'Ivory Coast',           1, 1),
  ('Brazil',                 'Ivory Coast',           2, 0),
  ('Japan',                  'Curacao',               3, 0),
  ('Brazil',                 'Japan',                 1, 0),
  ('Ivory Coast',            'Curacao',               2, 1),
  -- Group F: Germany, Colombia, Sweden, Morocco
  ('Germany',                'Morocco',               2, 0),
  ('Colombia',               'Sweden',                1, 1),
  ('Germany',                'Sweden',                2, 1),
  ('Colombia',               'Morocco',               2, 1),
  ('Germany',                'Colombia',              1, 1),
  ('Sweden',                 'Morocco',               0, 1),
  -- Group G: Portugal, South Korea, Ghana, New Zealand
  ('Portugal',               'New Zealand',           3, 0),
  ('South Korea',            'Ghana',                 1, 1),
  ('Portugal',               'Ghana',                 2, 1),
  ('South Korea',            'New Zealand',           2, 0),
  ('Portugal',               'South Korea',           1, 0),
  ('Ghana',                  'New Zealand',           2, 0),
  -- Group H: Netherlands, Ecuador, Cameroon, Qatar
  ('Netherlands',            'Qatar',                 3, 0),
  ('Ecuador',                'Cameroon',              1, 1),
  ('Netherlands',            'Cameroon',              2, 1),
  ('Ecuador',                'Qatar',                 2, 0),
  ('Netherlands',            'Ecuador',               1, 1),
  ('Cameroon',               'Qatar',                 1, 0),
  -- Group I: Croatia, Nigeria, Iraq, Venezuela (adjust to actual teams)
  ('Croatia',                'Iraq',                  2, 0),
  ('Nigeria',                'Venezuela',             2, 1),
  ('Croatia',                'Venezuela',             1, 0),
  ('Nigeria',                'Iraq',                  1, 1),
  ('Croatia',                'Nigeria',               0, 0),
  ('Iraq',                   'Venezuela',             1, 1),
  -- Group J: Uruguay, South Africa, Pakistan, Panama
  ('Uruguay',                'Pakistan',              3, 0),
  ('South Africa',           'Panama',                1, 0),
  ('Uruguay',                'Panama',                2, 0),
  ('South Africa',           'Pakistan',              2, 1),
  ('Uruguay',                'South Africa',          1, 1),
  ('Pakistan',               'Panama',                0, 1),
  -- Group K: Belgium, Egypt, DR Congo, El Salvador
  ('Belgium',                'El Salvador',           3, 0),
  ('Egypt',                  'DR Congo',              1, 1),
  ('Belgium',                'DR Congo',              2, 0),
  ('Egypt',                  'El Salvador',           2, 1),
  ('Belgium',                'Egypt',                 1, 0),
  ('DR Congo',               'El Salvador',           1, 0),
  -- Group L: Switzerland, Serbia, Cuba, Serbia (adjust to actual teams)
  ('Switzerland',            'Cuba',                  2, 0),
  ('Serbia',                 'Venezuela',             2, 1),
  ('Switzerland',            'Venezuela',             1, 0),
  ('Serbia',                 'Cuba',                  2, 0),
  ('Switzerland',            'Serbia',                1, 1),
  ('Cuba',                   'Venezuela',             0, 1)
) AS r(home_team, away_team, home_score, away_score)
JOIN public.demo_fixtures df
  ON  df.home  = r.home_team
  AND df.away  = r.away_team
  AND df.round = 'gs'
ON CONFLICT (demo_fixture_id)
DO UPDATE SET
  home_score     = EXCLUDED.home_score,
  away_score     = EXCLUDED.away_score,
  result_outcome = EXCLUDED.result_outcome,
  generated_at   = now();

-- ── Step 3: Recalculate demo_points for any existing predictions ──────────────
INSERT INTO public.demo_points (user_id, demo_fixture_id, points, is_correct, calculated_at)
SELECT
  dp.user_id,
  dp.demo_fixture_id,
  CASE WHEN dp.outcome = dr.result_outcome THEN 3 ELSE 0 END,
  dp.outcome = dr.result_outcome,
  now()
FROM public.demo_predictions dp
JOIN public.demo_results dr ON dr.demo_fixture_id = dp.demo_fixture_id
ON CONFLICT (user_id, demo_fixture_id)
DO UPDATE SET
  points        = EXCLUDED.points,
  is_correct    = EXCLUDED.is_correct,
  calculated_at = now();

-- ── Verify ───────────────────────────────────────────────────────────────────
SELECT
  'Demo seed complete'                                              AS status,
  (SELECT count(*) FROM public.demo_fixtures WHERE round = 'gs')  AS demo_fixtures,
  (SELECT count(*) FROM public.demo_results)                       AS demo_results,
  (SELECT count(*) FROM public.demo_fixtures df
   WHERE NOT EXISTS (SELECT 1 FROM public.demo_results dr WHERE dr.demo_fixture_id = df.id))
                                                                   AS fixtures_missing_result;
