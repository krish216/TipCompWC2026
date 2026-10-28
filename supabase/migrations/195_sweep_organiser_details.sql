-- 195: sweep organiser payment + contact details, and the approval window.
--
-- Kept OUT of public.comps on purpose: comps is publicly readable (orgs_public_read,
-- `using (true)` — every column, to the anon key). Bank details and a phone number must
-- not be. This table has RLS enabled and NO policies, so anon/authenticated get nothing
-- even with the grants below; only the service-role API routes read it, and they decide
-- who sees what (payment details → pool members; contact → a buyer whose request is overdue).
CREATE TABLE IF NOT EXISTS public.sweep_organiser_details (
  comp_id               uuid PRIMARY KEY REFERENCES public.comps(id) ON DELETE CASCADE,
  -- How long buyers should expect to wait for a cash/bank-transfer approval. Capped in the
  -- UI at the pool's auto-lock (30 min before race_start_at), so it never promises past the race.
  approval_window_hours int  NOT NULL DEFAULT 12 CHECK (approval_window_hours IN (2, 6, 12, 24)),
  -- Bank transfer: either BSB + account number, or a PayID (or both).
  bank_account_name     text,
  bank_bsb              text,
  bank_account_number   text,
  payid                 text,
  -- Shown to a buyer only once their request is past the approval window.
  contact_name          text,
  contact_phone         text,
  contact_email         text,
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sweep_organiser_details ENABLE ROW LEVEL SECURITY;

-- Explicit PostgREST grants (required from 30 Oct 2026 — see CLAUDE.md). With RLS on and no
-- policies these grant nothing to anon/authenticated in practice.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sweep_organiser_details TO anon, authenticated;
GRANT ALL ON TABLE public.sweep_organiser_details TO service_role;

-- "Remind organiser" rate limit — one nudge per approval window per request.
ALTER TABLE public.sweep_payment_requests ADD COLUMN IF NOT EXISTS last_reminded_at timestamptz;
-- A bank transfer can't be approved until its receipt is attached, so its approval window
-- starts here rather than at created_at (updated_at is no good — reminders bump it too).
ALTER TABLE public.sweep_payment_requests ADD COLUMN IF NOT EXISTS receipt_attached_at timestamptz;
