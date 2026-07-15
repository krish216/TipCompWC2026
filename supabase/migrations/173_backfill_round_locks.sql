-- 173: Backfill missing round_locks rows, and open the EPL warm-up round.
--
-- round_locks rows are seeded when a tournament is created, and the admin open/close toggle
-- does a plain UPDATE keyed on (tournament_id, round_code). Rounds added AFTER creation —
-- e.g. the EPL warm-up ('wup') added in migration 171 — never got a row, so the toggle
-- matched 0 rows and the round read as permanently closed (locked) regardless of the toggle
-- or Practice Mode. (The API is also changed to upsert so this can't recur.)
--
-- 1) Backfill a row for every tournament_round that lacks one (default closed).
-- 2) Open the EPL warm-up round so tipsters can practise.
-- Idempotent: the backfill only inserts missing rows; the warm-up open is a plain set.

INSERT INTO public.round_locks (tournament_id, round_code, is_open)
SELECT tr.tournament_id, tr.round_code, false
FROM public.tournament_rounds tr
LEFT JOIN public.round_locks rl
  ON rl.tournament_id = tr.tournament_id AND rl.round_code = tr.round_code
WHERE rl.id IS NULL
ON CONFLICT (tournament_id, round_code) DO NOTHING;

UPDATE public.round_locks rl
SET is_open = true, opened_at = now()
FROM public.tournaments t
WHERE t.id = rl.tournament_id
  AND t.slug = 'epl-2026-27'
  AND rl.round_code = 'wup';

-- Verify
SELECT t.slug, rl.round_code, rl.is_open
FROM public.round_locks rl
JOIN public.tournaments t ON t.id = rl.tournament_id
WHERE t.slug = 'epl-2026-27' AND rl.round_code = 'wup';

SELECT 'Migration 173 complete — round_locks backfilled; EPL warm-up round opened' AS status;
