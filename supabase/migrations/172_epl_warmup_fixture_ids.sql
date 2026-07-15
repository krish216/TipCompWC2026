-- 172: EPL Warm-Up — move the warm-up fixture ids into a distinctive 1400 block.
--
-- Migration 171 cloned Matchweek 1 into the warm-up round at ids 1387–1396 (contiguous with
-- the real EPL fixtures, so not visually distinctive). Renumber them to 1400–1409 so warm-up
-- rows stand out at a glance.
--
-- Safe because the warm-up fixtures are brand new: nothing references them yet (0 predictions,
-- 0 challenges, 0 chat). FKs to fixtures(id) are ON DELETE CASCADE / SET NULL with the default
-- ON UPDATE NO ACTION, so this only works while no dependent rows exist — which is the case now.
-- The old (1387–1396) and new (1400–1409) ranges are disjoint, so there's no mid-statement PK
-- collision.
--
-- Idempotent: the `f.id <> r.new_id` guard makes a re-run a no-op once ids are already 1400–1409.
-- Assumes 1400–1409 is free (verified: MAX(fixtures.id) was 1396 with nothing above it).

WITH renum AS (
  SELECT f.id AS old_id,
         1400 + (row_number() OVER (ORDER BY f.kickoff_utc, f.id)) - 1 AS new_id
  FROM public.fixtures f
  JOIN public.tournaments t ON t.id = f.tournament_id
  WHERE t.slug = 'epl-2026-27' AND f.round = 'wup'
)
UPDATE public.fixtures f
SET id = r.new_id
FROM renum r
WHERE f.id = r.old_id AND f.id <> r.new_id;

-- Resync the id sequence to the new MAX(id) so future sequence-based inserts can't collide
-- with the renumbered warm-up fixtures.
DO $$
DECLARE seq text := pg_get_serial_sequence('public.fixtures', 'id');
BEGIN
  IF seq IS NOT NULL THEN
    PERFORM setval(seq, (SELECT MAX(id) FROM public.fixtures), true);
  END IF;
END $$;

-- Verify
SELECT f.id, f.home, f.away, f.kickoff_utc
FROM public.fixtures f
JOIN public.tournaments t ON t.id = f.tournament_id
WHERE t.slug = 'epl-2026-27' AND f.round = 'wup'
ORDER BY f.id;

SELECT 'Migration 172 complete — EPL warm-up fixtures renumbered to 1400–1409, sequence resynced' AS status;
