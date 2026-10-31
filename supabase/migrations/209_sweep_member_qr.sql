-- 209_sweep_member_qr.sql
-- My Pool shows members the sweep's join QR + link ("Bring a colleague in"), so whoever's in
-- the sweep can sign up the person at the next desk. On by default; the organiser can turn
-- it off from sweep-admin's Sell tab, leaving their own QR as the only way in. Ticket
-- requests still go through the organiser either way.
--
-- Column on an existing table, so no new PostgREST grants are needed.

ALTER TABLE public.comps
  ADD COLUMN IF NOT EXISTS sweep_member_qr boolean NOT NULL DEFAULT true;
