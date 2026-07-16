-- 175: EPL warm-up — add the FA Community Shield (Arsenal v Manchester City,
-- 16 Aug 2026, Millennium Stadium, Cardiff) so a match challenge can be organised for it.
--
-- The Community Shield is a SEPARATE competition — not in the eng.1 league feed — so it's a
-- manual fixture in the warm-up ('wup') round, like the Socceroos match challenge. Its
-- result can be entered manually; an ESPN event id can be attached later (fixtures.espn_
-- event_id) if live scoring is wanted (ESPN carries it under a non-eng.1 competition).
--
-- Team names match tournament_teams ('Arsenal', 'Manchester City') so crests render.
-- Idempotent: only inserts if the Shield isn't already in the EPL warm-up round.
-- Uses an explicit id (MAX+1) because fixtures were seeded with explicit ids (stale
-- sequence), then resyncs the sequence — same as migrations 171/172.

INSERT INTO public.fixtures (id, round, grp, home, away, kickoff_utc, venue, tournament_id)
SELECT
  (SELECT COALESCE(MAX(id), 0) + 1 FROM public.fixtures),
  'wup', NULL, 'Arsenal', 'Manchester City',
  '2026-08-16T14:00:00+00:00', 'Millennium Stadium, Cardiff', t.id
FROM public.tournaments t
WHERE t.slug = 'epl-2026-27'
  AND NOT EXISTS (
    SELECT 1 FROM public.fixtures f
    JOIN public.tournaments t2 ON t2.id = f.tournament_id
    WHERE t2.slug = 'epl-2026-27' AND f.round = 'wup'
      AND f.home = 'Arsenal' AND f.away = 'Manchester City'
  );

-- Resync the id sequence to MAX(id) so future sequence-based inserts can't collide.
DO $$
DECLARE seq text := pg_get_serial_sequence('public.fixtures', 'id');
BEGIN
  IF seq IS NOT NULL THEN
    PERFORM setval(seq, (SELECT MAX(id) FROM public.fixtures), true);
  END IF;
END $$;

-- Verify
SELECT f.id, f.home, f.away, f.kickoff_utc, f.venue
FROM public.fixtures f
JOIN public.tournaments t ON t.id = f.tournament_id
WHERE t.slug = 'epl-2026-27' AND f.round = 'wup'
  AND f.home = 'Arsenal' AND f.away = 'Manchester City';

SELECT 'Migration 175 complete — Community Shield (Arsenal v Man City) added to EPL warm-up' AS status;
