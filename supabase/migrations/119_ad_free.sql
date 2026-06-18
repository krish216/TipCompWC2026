-- Migration 119 — ad-free tier
--
-- A cheap, one-time, per-tournament purchase that just removes ads for an
-- individual tipster (distinct from is_premium, which unlocks organiser features
-- AND removes ads). Set by the Stripe webhook on a 'kind=ad_free' checkout.

ALTER TABLE public.user_tournaments
  ADD COLUMN IF NOT EXISTS is_ad_free boolean NOT NULL DEFAULT false;

SELECT '119 complete — user_tournaments.is_ad_free added' AS status;
