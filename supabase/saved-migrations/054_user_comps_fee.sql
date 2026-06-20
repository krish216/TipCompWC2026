-- Migration 054: add fee tracking columns to user_comps
-- No new table — payment status lives directly on the membership row.

ALTER TABLE public.user_comps
  ADD COLUMN IF NOT EXISTS fee_paid        boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fee_paid_amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS fee_paid_at     timestamptz,
  ADD COLUMN IF NOT EXISTS fee_notes       text;

-- Also add fee settings to comps table if not already present
ALTER TABLE public.comps
  ADD COLUMN IF NOT EXISTS requires_payment_fee boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS entry_fee_amount     numeric(10,2);

SELECT 'Migration 054 complete — fee_paid columns added to user_comps' AS status;
