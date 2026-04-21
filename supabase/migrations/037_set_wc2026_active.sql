-- Migration 037 — mark WC2026 as active tournament
-- The tournament was seeded as 'upcoming' in migration 024.
-- The admin page manages status; this migration sets it correctly.

UPDATE public.tournaments
SET status = 'active'
WHERE slug = 'wc2026'
  AND status = 'upcoming';

-- Verify
SELECT id, name, slug, status, start_date FROM public.tournaments;
SELECT 'Migration 037 complete' AS status;
