-- 167: public Tipster trophy-cabinet profile (/tipster/[id])
--
-- Two small columns feed the new public tipster page:
--   • users.hide_tipster_profile — opt-out flag. Tipsters with a real record are public by
--     default; setting this true hides their page (notFound + noindex). Respects the existing
--     show_first_name privacy toggle for naming.
--   • tournaments.is_inaugural — marks TribePicks' first tournament (WC 2026). Tipsters who
--     tipped in it earn the permanent, unrepeatable "Founding Tipster" heritage trophy. A flag
--     (not a hardcoded slug) so a future launch cohort — e.g. Founding EPL — can be stamped
--     without a code change.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS hide_tipster_profile boolean NOT NULL DEFAULT false;

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS is_inaugural boolean NOT NULL DEFAULT false;

-- WC 2026 is the founding tournament.
UPDATE public.tournaments SET is_inaugural = true WHERE slug = 'wc2026';

SELECT 'Migration 167 complete — hide_tipster_profile + is_inaugural (wc2026 flagged)' AS status;
