-- Migration 087 — Custom email_verified flag
-- Supabase auto-sets email_confirmed_at when "Confirm email" is disabled,
-- so we track verification explicitly via a column we control.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false;

-- All users who existed before this migration have already been through the
-- old verified-then-login flow — mark them as verified so the banner doesn't
-- appear for them.
UPDATE public.users SET email_verified = true;

SELECT 'Migration 087 complete — users.email_verified added and backfilled' AS status;
