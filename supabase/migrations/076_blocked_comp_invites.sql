-- Migration 076 — blocked_comp_ids on user_tournaments
--
-- When a tipster declines a comp invitation and chooses not to see future
-- invitations from that comp, we store the comp_id in an array on their
-- tournament enrollment row. This keeps the block scoped to the tournament
-- the comp belongs to, persists across devices, and avoids a new table.

ALTER TABLE public.user_tournaments
ADD COLUMN IF NOT EXISTS blocked_comp_ids TEXT[] DEFAULT '{}';

SELECT 'Migration 076 complete — blocked_comp_ids added to user_tournaments' AS status;
