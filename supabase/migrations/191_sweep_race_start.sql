-- 191: precise race start time for sweep tournaments. tournaments.start_date/end_date are
-- date-only columns (no time-of-day) — the auto-lock-30-minutes-before-race feature needs a
-- real timestamp. Nullable: a tournament without it set simply never auto-locks (safe
-- default, no behavior change until a platform admin sets it via /admin/sweep-horses).
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS race_start_at timestamptz;

SELECT 'Migration 191 complete — tournaments.race_start_at added' AS status;
