-- 202_sweep_bank_shared_directly.sql
-- Some organisers won't put their bank details on TribePicks — they share them with their
-- punters directly (group chat, email, in person). This flag lets them still offer bank
-- transfer: buyers are told to get the details from the organiser, then attach a receipt
-- as usual. Setting it to true requires the organiser to confirm they have shared, or will
-- share, the details with everyone buying a ticket (enforced in /api/comps/:id/sweep-settings).
-- Lives on sweep_organiser_details (private, service-role only), not on the public comps table.

ALTER TABLE public.sweep_organiser_details
  ADD COLUMN IF NOT EXISTS bank_shared_directly boolean NOT NULL DEFAULT false;
