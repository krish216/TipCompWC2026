-- 162: users.socials — a Chief's public social links (X / Instagram / TikTok / YouTube /
-- Facebook / website). Shown on the public Chief profile as trust + reach signals.
--
-- One jsonb map { platform: url } rather than six columns — flexible and easy to extend.
-- URLs are host-validated to the real platform (https only) on BOTH write (Settings) and
-- render (profile), so a bad/malicious link is never stored as, or shown as, a trusted
-- platform link. Links render with rel="nofollow noopener".

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS socials jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.users.socials IS
  'Public social links for the Comp-Chief profile, as { platform: url }. Host-validated on write and render.';

SELECT 'Migration 162 complete — users.socials added' AS status;
