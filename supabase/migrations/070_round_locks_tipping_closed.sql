-- Migration 070 — add tipping_closed flag to round_locks
-- When true, all tribe members can see every player's tips for that round.

ALTER TABLE public.round_locks
  ADD COLUMN IF NOT EXISTS tipping_closed boolean NOT NULL DEFAULT false;

SELECT 'Migration 070 complete — tipping_closed added to round_locks' AS status;
