-- 126: Bracket-slot mapping on knockout fixtures.
--
-- The bracket challenge defines a FIXED knockout structure (r32:1 = 1E vs T1, …).
-- Scoring previously inferred "slot N" from the Nth fixture by kickoff, which only
-- holds when kickoff order == bracket order. For WC2026 the real ESPN schedule is
-- NOT in bracket order, so we pin each knockout fixture to its slot explicitly.
--
-- bracket_slot   : 'r32:1'…'r32:16','r16:1'… ,'qf:1'… ,'sf:1','sf:2','tp','final'
-- espn_event_id  : ESPN event id, so the schedule-sync is idempotent and can refresh
--                  teams/date/venue per fixture without re-deriving the mapping.

ALTER TABLE public.fixtures ADD COLUMN IF NOT EXISTS bracket_slot   text;
ALTER TABLE public.fixtures ADD COLUMN IF NOT EXISTS espn_event_id  text;

CREATE INDEX IF NOT EXISTS fixtures_bracket_slot_idx ON public.fixtures (tournament_id, bracket_slot);
