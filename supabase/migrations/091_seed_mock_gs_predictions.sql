-- Migration 091 — Random predictions for mockuser% accounts across GS1/GS2/GS3
--
-- Finds all public.users whose email matches 'mockuser%', then generates a
-- random outcome prediction for every GS1/GS2/GS3 fixture in the active
-- tournament.  Existing predictions are overwritten with fresh random picks.
--
-- Steps:
--   1. Collect mock user IDs
--   2. Bypass per-row scoring trigger (session_replication_role = replica)
--   3. Upsert predictions with random H/D/A outcome
--   4. Restore triggers
--   5. Touch each affected fixture to bulk-score all predictions
--   6. Refresh leaderboard materialised view

-- ── 1. Mock users ─────────────────────────────────────────────────────────────
CREATE TEMP TABLE _mock_users AS
SELECT id FROM public.users WHERE email LIKE 'mockuser%';

-- ── 2. GS1/GS2/GS3 fixtures for the active tournament ────────────────────────
CREATE TEMP TABLE _gs_fixtures AS
SELECT f.id AS fixture_id, f.tournament_id
FROM   public.fixtures f
JOIN   public.tournaments t ON t.id = f.tournament_id
WHERE  t.is_active = true
  AND  f.round IN ('gs1', 'gs2', 'gs3')
ORDER BY f.id;

-- ── 3. Bypass per-row auto-score trigger ──────────────────────────────────────
SET session_replication_role = replica;

-- ── 4. Upsert predictions — random outcome, points reset to 0 ─────────────────
INSERT INTO public.predictions (
  user_id, fixture_id, tournament_id,
  home, away, outcome,
  standard_points, bonus_points,
  created_at, updated_at
)
SELECT
  u.id                                                       AS user_id,
  f.fixture_id,
  f.tournament_id,
  0::smallint                                                AS home,
  0::smallint                                                AS away,
  (ARRAY['H','D','A'])[1 + floor(random() * 3)::int]        AS outcome,
  0                                                          AS standard_points,
  0                                                          AS bonus_points,
  now()                                                      AS created_at,
  now()                                                      AS updated_at
FROM _mock_users u
CROSS JOIN _gs_fixtures f
ON CONFLICT (user_id, fixture_id) DO UPDATE SET
  outcome         = EXCLUDED.outcome,
  home            = 0,
  away            = 0,
  standard_points = 0,
  bonus_points    = 0,
  updated_at      = now();

-- ── 5. Restore normal trigger mode ───────────────────────────────────────────
SET session_replication_role = DEFAULT;

-- ── 6. Touch each fixture to bulk-score all predictions ──────────────────────
-- score_predictions_for_fixture() fires on home_score UPDATE and scores every
-- prediction for that fixture in one pass — only runs when result is entered.
UPDATE public.fixtures
SET    home_score = home_score
WHERE  id IN (SELECT fixture_id FROM _gs_fixtures)
  AND  home_score IS NOT NULL;

-- ── 7. Refresh leaderboard ───────────────────────────────────────────────────
REFRESH MATERIALIZED VIEW public.leaderboard;

SELECT
  (SELECT count(*) FROM _mock_users)   AS mock_users,
  (SELECT count(*) FROM _gs_fixtures)  AS gs_fixtures,
  (SELECT count(*) FROM _mock_users) *
  (SELECT count(*) FROM _gs_fixtures)  AS predictions_upserted,
  '091 complete — GS1/GS2/GS3 predictions generated for all mockuser% accounts' AS status;
