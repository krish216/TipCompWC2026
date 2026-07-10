-- 155: per-tournament warm-up comp
--
-- The onboarding "Warm-Up Comp" join was hardcoded to the WC comp/tribe invite codes,
-- so a user switched into another tournament (e.g. EPL) still saw the WC warm-up. Make
-- it a per-tournament config: the default comp new joiners land in, plus an optional
-- warm-up tribe to auto-join. Null warmup_comp_code → no warm-up card for that tournament.

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS warmup_comp_code  text,
  ADD COLUMN IF NOT EXISTS warmup_tribe_code text;

-- WC: existing warm-up comp + tribe.
UPDATE public.tournaments
  SET warmup_comp_code = 'WCEH3GB9', warmup_tribe_code = 'VZ3JEZRA'
  WHERE slug = 'wc2026';

-- EPL: the default comp created for first-time joiners ("EPL26/27 Warm-Up Comp 1").
-- No dedicated warm-up tribe yet → tribe auto-join is skipped.
UPDATE public.tournaments
  SET warmup_comp_code = 'B3KBJM1G'
  WHERE slug = 'epl-2026-27';

SELECT 'Migration 155 complete — per-tournament warmup_comp_code / warmup_tribe_code' AS status;
