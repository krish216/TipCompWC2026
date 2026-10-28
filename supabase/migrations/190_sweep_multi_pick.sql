-- 190: sweep multi-pick — a punter can hold more than one ticket in a pool, each ticket
-- granted individually by the comp admin once they've collected payment for it (money
-- stays offline — this just records "they've paid, give them N picks"). Each row in
-- sweep_entries is now one TICKET, not "this person's one slot": UNIQUE(tribe_id,
-- user_id) is dropped (a person can hold many rows), UNIQUE(tribe_id, horse_id) stays
-- (a horse can still only ever be claimed once per pool).
--
-- Consequence: locking a tribe (sweep/lock) no longer auto-creates entries — it now only
-- stops new members joining that pool (self-register's overflow routing). Tickets are
-- granted by the admin via sweep/grant-tickets, any time, to any current member, whether
-- the pool is locked or not. The wheel becomes available to a member as soon as they hold
-- an unclaimed ticket, independent of the tribe's lock state.
ALTER TABLE public.sweep_entries DROP CONSTRAINT IF EXISTS sweep_entries_tribe_id_user_id_key;

SELECT 'Migration 190 complete — sweep_entries allows multiple tickets per user' AS status;
