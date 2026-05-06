-- Migration 085 — Premium features

-- 1. Per-user per-tournament premium flag (manually grandfatherable via Supabase dashboard)
ALTER TABLE public.user_tournaments
  ADD COLUMN IF NOT EXISTS is_premium boolean NOT NULL DEFAULT false;

-- 2. Tournament-level enforcement switch
--    OFF (false) = premium features free for everyone (soft-launch / testing)
--    ON  (true)  = gating active; non-premium comp admins see crown/lock UI
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS enforce_premium boolean NOT NULL DEFAULT false;

SELECT 'Migration 085 complete — is_premium on user_tournaments, enforce_premium on tournaments' AS status;
