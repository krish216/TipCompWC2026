-- Migration 082 — Seed 250 mock tipsters for warm-up comp
--
-- Comp:  7c5e256f-67c0-4f66-98d3-9a69f839f815
-- Tribe: 8fc7ec13-e7ac-4a23-afca-dae2d15b8086
--
-- Creates 250 synthetic auth.users + public.users, enrolls them in the comp,
-- tournament and tribe, then generates random predictions for the first 4 WUP
-- fixtures (ordered by fixtures.id).  Since results are already entered, the
-- scoring trigger fires on the fixture touch in step 8 and scores everyone.
--
-- All bulk inserts run with session_replication_role = replica to bypass:
--   • handle_new_user          (auth → public.users)
--   • match_comp_invitation    (user_comps → comp_invitations)
--   • init_comp_payment_on_join (user_comps → comp_payments)
--   • trg_auto_score_prediction (predictions → per-row scoring)
-- Scoring is done in bulk via fixture touch (step 8); leaderboard refreshed once.

-- ── 1. Generate 250 mock users ───────────────────────────────────────────────
CREATE TEMP TABLE _mock_seed AS
SELECT
  gen_random_uuid()                          AS id,
  n                                          AS seq,
  'mockuser_' || n || '@tribepicks.dev'      AS email,
  'Mock Tipster ' || lpad(n::text, 3, '0')   AS display_name
FROM generate_series(1, 250) AS n;

-- ── 2. Bypass all triggers for the bulk insert block ─────────────────────────
SET session_replication_role = replica;

-- ── 3. auth.users ────────────────────────────────────────────────────────────
INSERT INTO auth.users (
  id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_user_meta_data, raw_app_meta_data
)
SELECT
  m.id,
  'authenticated',
  'authenticated',
  m.email,
  '',
  now(), now(), now(),
  jsonb_build_object('display_name', m.display_name),
  '{"provider":"mock","providers":["mock"]}'::jsonb
FROM _mock_seed m
ON CONFLICT (id) DO NOTHING;

-- ── 4. public.users (handle_new_user bypassed — insert directly) ─────────────
INSERT INTO public.users (id, email, display_name, onboarding_complete, created_at, updated_at)
SELECT m.id, m.email, m.display_name, true, now(), now()
FROM _mock_seed m
ON CONFLICT (id) DO NOTHING;

-- ── 5. Comp membership ───────────────────────────────────────────────────────
INSERT INTO public.user_comps (user_id, comp_id)
SELECT m.id, '7c5e256f-67c0-4f66-98d3-9a69f839f815'
FROM _mock_seed m
ON CONFLICT DO NOTHING;

-- ── 6. Tournament enrollment ─────────────────────────────────────────────────
INSERT INTO public.user_tournaments (user_id, tournament_id)
SELECT m.id, c.tournament_id
FROM _mock_seed m
CROSS JOIN (
  SELECT tournament_id
  FROM   public.comps
  WHERE  id = '7c5e256f-67c0-4f66-98d3-9a69f839f815'
) c
ON CONFLICT DO NOTHING;

-- ── 7. Tribe membership ──────────────────────────────────────────────────────
INSERT INTO public.tribe_members (user_id, tribe_id)
SELECT m.id, '8fc7ec13-e7ac-4a23-afca-dae2d15b8086'
FROM _mock_seed m
ON CONFLICT DO NOTHING;

-- ── 8. User preferences (leaderboard comp / tournament display) ──────────────
INSERT INTO public.user_preferences (user_id, tournament_id, comp_id)
SELECT m.id, c.tournament_id, '7c5e256f-67c0-4f66-98d3-9a69f839f815'
FROM _mock_seed m
CROSS JOIN (
  SELECT tournament_id
  FROM   public.comps
  WHERE  id = '7c5e256f-67c0-4f66-98d3-9a69f839f815'
) c
ON CONFLICT DO NOTHING;

-- ── 9. Predictions — random, bypassing per-row auto-score trigger ────────────
--
-- Score mode: random 0-4 goals for home + away, outcome = null
-- Outcome mode: home = 0, away = 0, outcome = random H/D/A
--
-- We take the first 4 WUP fixtures for this tournament (ORDER BY fixtures.id).
INSERT INTO public.predictions (
  user_id, fixture_id, tournament_id,
  home, away, outcome,
  standard_points, bonus_points,
  created_at, updated_at
)
SELECT
  m.id                                                              AS user_id,
  f.id                                                              AS fixture_id,
  f.tournament_id,
  CASE WHEN tr.predict_mode = 'score'
       THEN floor(random() * 5)::smallint
       ELSE 0::smallint
  END                                                               AS home,
  CASE WHEN tr.predict_mode = 'score'
       THEN floor(random() * 5)::smallint
       ELSE 0::smallint
  END                                                               AS away,
  CASE WHEN tr.predict_mode = 'outcome'
       THEN (ARRAY['H','D','A'])[1 + floor(random() * 3)::int]
       ELSE NULL
  END                                                               AS outcome,
  0                                                                 AS standard_points,
  0                                                                 AS bonus_points,
  now()                                                             AS created_at,
  now()                                                             AS updated_at
FROM _mock_seed m
CROSS JOIN (
  SELECT f.id, f.tournament_id
  FROM   public.fixtures f
  JOIN   public.comps c ON c.tournament_id = f.tournament_id
  WHERE  c.id  = '7c5e256f-67c0-4f66-98d3-9a69f839f815'
    AND  f.round = 'wup'
  ORDER BY f.id
  LIMIT 4
) f
JOIN public.tournament_rounds tr
  ON  tr.tournament_id = f.tournament_id
  AND tr.round_code    = 'wup'
ON CONFLICT (user_id, fixture_id) DO NOTHING;

-- ── 10. Restore normal trigger mode ──────────────────────────────────────────
SET session_replication_role = DEFAULT;

-- ── 11. Bulk-score all 250 predictions per fixture (4 passes) ────────────────
-- Touching home_score fires score_predictions_for_fixture() which does a single
-- bulk UPDATE on all predictions for that fixture — far cheaper than per-row.
UPDATE public.fixtures
SET home_score = home_score
WHERE id IN (
  SELECT f.id
  FROM   public.fixtures f
  JOIN   public.comps c ON c.tournament_id = f.tournament_id
  WHERE  c.id  = '7c5e256f-67c0-4f66-98d3-9a69f839f815'
    AND  f.round = 'wup'
  ORDER BY f.id
  LIMIT 4
)
AND home_score IS NOT NULL;

-- ── 12. Refresh leaderboard once ─────────────────────────────────────────────
REFRESH MATERIALIZED VIEW public.leaderboard;

SELECT '082 complete — 250 mock tipsters seeded for warm-up comp' AS status;
