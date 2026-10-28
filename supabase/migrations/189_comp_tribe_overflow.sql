-- 189: tribe overflow — cap tribe size, cap tribe count, let an org admin close pool
-- creation. Generic to every comp (WC/EPL/sweep alike), not sweep-specific.
--
-- comps.max_tribe_size already exists (default 15) and caps members WITHIN one tribe —
-- unchanged. This adds a cap on the NUMBER of tribes, and a "no more pools" switch:
--   max_tribes        — once every existing tribe is at max_tribe_size, a new joiner gets
--                        auto-placed into a freshly created tribe, up to this many tribes
--                        total. Default 10 is generous — most comps never approach it.
--   tribes_closed_at  — set by the comp admin ("Close pool creation"). While set, no new
--                        tribe is ever auto-created, regardless of max_tribes headroom —
--                        it freezes the pool count where it stands. Existing tribes with
--                        room still accept joiners; it only stops GROWTH in tribe count.
ALTER TABLE public.comps
  ADD COLUMN IF NOT EXISTS max_tribes       integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS tribes_closed_at timestamptz;

SELECT 'Migration 189 complete — comps.max_tribes (default 10) + comps.tribes_closed_at' AS status;
