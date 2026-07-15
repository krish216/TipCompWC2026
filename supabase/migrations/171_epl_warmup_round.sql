-- 171: EPL — Warm-Up round (Round 0), mirroring the WC2026 warm-up pattern.
--
-- The warm-up is a convention, not a schema feature: a tournament_rounds row with
-- round_code = 'wup' plus fixtures tagged round = 'wup'. The app already special-cases
-- 'wup' generically (amber "practice, points will be cleared" notice, excluded from the
-- month rail; the predict page now shows the warm-up tab only while Practice Mode is on).
--
-- Per the tipster's ask, EPL Round 0 REPLICATES Matchweek 1 so players can practise on
-- the real opening fixtures and be scored once Practice Mode
-- (tournaments.allow_retroactive_predictions) is switched on. It is created with
-- include_in_scoring = true so warm-up predictions score during the practice window; flip
-- it to false (and re-trigger) to clear the points before the season goes live — exactly
-- how the WC warm-up was wound down.
--
-- EPL's warm-up comp code (tournaments.warmup_comp_code = 'IW6F348H') is already set by
-- migrations 155/157, so the warm-up card/onboarding is wired. EPL stays is_active = false
-- (admin-only preview), so none of this is visible to the public.
--
-- Idempotent: the round upsert does nothing if the 'wup' round already exists, and the
-- fixture clone only runs while EPL has no 'wup' fixtures yet.

-- 1. Warm-Up round — clone MW1's (r1) scoring config so scoring is identical, but sit it
--    at round_order 0 (sorts before MW1), give it its own tab, force it into scoring, and
--    drop the month overlay (warm-up is not part of a calendar month).
INSERT INTO public.tournament_rounds
  (tournament_id, round_code, round_name, round_order, predict_mode, result_pts, exact_bonus,
   pen_bonus, fav_team_2x, tab_group, tab_label, is_knockout, include_in_scoring,
   margin_bonus, fav_exact_bonus, month_key, month_label)
SELECT
  r.tournament_id, 'wup', 'Warm-Up', 0, r.predict_mode, r.result_pts, r.exact_bonus,
  r.pen_bonus, r.fav_team_2x, 'wup', 'Warm-Up', r.is_knockout, true,
  r.margin_bonus, r.fav_exact_bonus, NULL, NULL
FROM public.tournament_rounds r
JOIN public.tournaments t ON t.id = r.tournament_id
WHERE t.slug = 'epl-2026-27' AND r.round_code = 'r1'
ON CONFLICT (tournament_id, round_code) DO NOTHING;  -- don't clobber a later manual toggle

-- 2. Clone the Matchweek 1 fixtures into the warm-up round (same teams/kickoffs/venues,
--    scores left NULL for the admin to enter hypothetical results). Guarded so re-running
--    never duplicates.
--    NB: fixtures were seeded with explicit ids, so the id sequence is stale — an insert
--    that omits id collides (fixtures_pkey). Assign explicit ids past the current MAX(id)
--    instead, then resync the sequence so future inserts are safe too.
INSERT INTO public.fixtures (id, round, grp, home, away, kickoff_utc, venue, tournament_id)
SELECT
  (SELECT COALESCE(MAX(id), 0) FROM public.fixtures) + row_number() OVER (ORDER BY f.kickoff_utc, f.id),
  'wup', f.grp, f.home, f.away, f.kickoff_utc, f.venue, f.tournament_id
FROM public.fixtures f
JOIN public.tournaments t ON t.id = f.tournament_id
WHERE t.slug = 'epl-2026-27' AND f.round = 'r1'
  AND NOT EXISTS (
    SELECT 1 FROM public.fixtures w
    JOIN public.tournaments t2 ON t2.id = w.tournament_id
    WHERE t2.slug = 'epl-2026-27' AND w.round = 'wup'
  );

-- Resync the id sequence to MAX(id) so any later sequence-based insert won't collide.
DO $$
DECLARE seq text := pg_get_serial_sequence('public.fixtures', 'id');
BEGIN
  IF seq IS NOT NULL THEN
    PERFORM setval(seq, (SELECT MAX(id) FROM public.fixtures), true);
  END IF;
END $$;

-- Verify
SELECT round_code, round_name, round_order, predict_mode, result_pts, include_in_scoring, tab_group, tab_label
FROM public.tournament_rounds tr
JOIN public.tournaments t ON t.id = tr.tournament_id
WHERE t.slug = 'epl-2026-27' AND tr.round_code = 'wup';

SELECT round, count(*) AS fixtures
FROM public.fixtures f
JOIN public.tournaments t ON t.id = f.tournament_id
WHERE t.slug = 'epl-2026-27' AND f.round = 'wup'
GROUP BY round;

SELECT 'Migration 171 complete — EPL Warm-Up (Round 0) created, Matchweek 1 fixtures cloned' AS status;
