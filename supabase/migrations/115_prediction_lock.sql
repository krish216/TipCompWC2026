-- 115: Per-fixture prediction lock ("lock in to reveal the tribe tipsheet")
-- A user may voluntarily LOCK a single prediction. Once locked it is final —
-- it cannot be edited, withdrawn, or unlocked. Locking is the commitment that
-- earns the right to view the tribe's tipsheet for that fixture (mutual reveal:
-- you only see members who have also locked). Distinct from the existing
-- edit-window "lock" (round_locks / kickoff), which is enforced separately.
--
-- locked_at = null → unlocked (editable as normal); non-null → committed/final.
ALTER TABLE public.predictions ADD COLUMN IF NOT EXISTS locked_at timestamptz;
