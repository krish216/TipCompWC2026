-- 156: seed EPL round_locks (open matchweek 1 for tipping)
--
-- EPL had no round_locks rows, so the predict API's default (only 'gs' open) left every
-- matchweek locked. Seed all 38 matchweeks from tournament_rounds — mirroring how WC is
-- set up — with MW1 (r1) OPEN for tipping and the rest locked until an admin opens them.
-- Idempotent: skips any round already present.

INSERT INTO public.round_locks (tournament_id, round_code, is_open)
SELECT tr.tournament_id, tr.round_code, (tr.round_code = 'r1')
FROM   public.tournament_rounds tr
JOIN   public.tournaments t ON t.id = tr.tournament_id
WHERE  t.slug = 'epl-2026-27'
ON CONFLICT (tournament_id, round_code) DO NOTHING;

SELECT round_code, is_open
FROM public.round_locks
WHERE tournament_id = (SELECT id FROM public.tournaments WHERE slug = 'epl-2026-27')
ORDER BY round_code;
