-- Migration 199: sweep ticket price + prize split.
--
-- Until now a sweep had no price anywhere (the "$5" lived only in the comp name), so
-- nothing could work out prizes. These go on comps because none of it is sensitive —
-- buyers need to see all three before they buy (comps is publicly readable; see
-- sweep_organiser_details for what must NOT go here).
--
--   sweep_ticket_price_cents  price of one ticket, in cents. NULL = not set yet (legacy
--                             sweeps); the app then shows no prize table.
--   sweep_prize_split         percentages for 1st, 2nd, 3rd — always three, summing to
--                             100 (e.g. {70,20,10}; winner-takes-all is {100,0,0}).
--   sweep_deduct_fee          take the organiser's TribePicks pool fee (what they actually
--                             paid — see sweep_pool_purchases) out of the prize pot, shared
--                             equally across the sweep's pools. No fee paid → nothing deducted.

ALTER TABLE public.comps
  ADD COLUMN IF NOT EXISTS sweep_ticket_price_cents int
    CHECK (sweep_ticket_price_cents IS NULL OR sweep_ticket_price_cents BETWEEN 50 AND 100000),
  ADD COLUMN IF NOT EXISTS sweep_prize_split int[] NOT NULL DEFAULT '{70,20,10}'
    CHECK (array_length(sweep_prize_split, 1) = 3
           AND sweep_prize_split[1] + sweep_prize_split[2] + sweep_prize_split[3] = 100
           AND sweep_prize_split[1] >= 0 AND sweep_prize_split[2] >= 0 AND sweep_prize_split[3] >= 0),
  ADD COLUMN IF NOT EXISTS sweep_deduct_fee boolean NOT NULL DEFAULT true;
