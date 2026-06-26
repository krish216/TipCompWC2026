-- Migration 131 — sponsor banner branding for the co-branded Bracket Leaderboard.
--
-- The brochure-style banner strip needs a brand colour (the banner background) and an
-- optional subtitle/location line (e.g. "Earlwood & Wolli Creek"). Neither existed on
-- the sponsors model. Both are nullable — when brand_color is null the banner falls back
-- to the existing dark-green treatment, so nothing breaks before data is set.

ALTER TABLE public.sponsors
  ADD COLUMN IF NOT EXISTS brand_color text,   -- banner background hex, e.g. '#F4C842'
  ADD COLUMN IF NOT EXISTS tagline     text;   -- banner subtitle, e.g. 'Earlwood & Wolli Creek'

SELECT '131 complete — sponsors.brand_color + tagline added' AS status;
