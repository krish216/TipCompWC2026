-- Migration 133 — podium place prizes for sponsor campaigns.
--
-- `prize` stays the HEADLINE / total prize for the challenge (e.g. "$500 worth of
-- fuel vouchers to be won") — shown in the hero. These add the optional per-place
-- breakdown (1st/2nd/3rd, e.g. $250 / $150 / $100), rendered as a 🥇🥈🥉 row.
-- Nullable — each place is displayed only when its prize is set.

ALTER TABLE public.sponsor_campaigns
  ADD COLUMN IF NOT EXISTS prize_1 text,   -- 1st place prize
  ADD COLUMN IF NOT EXISTS prize_2 text,   -- 2nd place prize
  ADD COLUMN IF NOT EXISTS prize_3 text;   -- 3rd place prize

SELECT '133 complete — sponsor_campaigns.prize_1/2/3 added' AS status;
