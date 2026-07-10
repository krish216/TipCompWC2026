-- 157: re-point EPL warm-up comp to the recreated comp
--
-- The original EPL warm-up comp (B3KBJM1G, set in migration 155) was deleted and
-- recreated as "EPL Warm-Up Comp Uno" (IW6F348H), so warmup_comp_code was pointing at
-- a code that no longer exists → the onboarding "Join" failed. Point it at the new comp.

UPDATE public.tournaments
  SET warmup_comp_code = 'IW6F348H'
  WHERE slug = 'epl-2026-27';

SELECT slug, warmup_comp_code, warmup_tribe_code
FROM public.tournaments WHERE slug = 'epl-2026-27';
