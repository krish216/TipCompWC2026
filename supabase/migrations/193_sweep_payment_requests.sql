-- 193: sweep ticket-purchase requests — the self-serve request/approval ledger behind the
-- buyer "buy tickets" flow. Mirrors comp_payments (migration 054) but adds the
-- pending/approved/rejected workflow that doesn't exist anywhere else in the schema, plus
-- a receipt image and the three payment methods (cash/bank_transfer/iou).
--
-- status vs paid_at: `status` tracks whether the REQUEST itself was accepted (tickets
-- granted or not); `paid_at` tracks whether the MONEY has actually changed hands. These are
-- independent for `iou`: an IOU request is approved (ticketed) immediately with
-- paid_at = NULL ("owing"), and later gets paid_at set via the `mark_paid` action without
-- re-running approval. For cash/bank_transfer, approval and payment happen in the same
-- action, so paid_at is always set alongside status='approved'.
CREATE TABLE IF NOT EXISTS public.sweep_payment_requests (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id          uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  comp_id           uuid NOT NULL REFERENCES public.comps(id)  ON DELETE CASCADE, -- denormalized for RLS + the comp-wide rollup
  user_id           uuid NOT NULL REFERENCES public.users(id)  ON DELETE CASCADE, -- the buyer
  tickets_requested int  NOT NULL CHECK (tickets_requested > 0),
  payment_method    text NOT NULL CHECK (payment_method IN ('cash', 'bank_transfer', 'iou')),
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  amount            numeric(10,2),
  receipt_url       text,     -- storage PATH in the sweep-receipts bucket, not a baked URL — signed URLs expire
  notes             text,     -- e.g. a rejection reason
  reviewed_by       uuid REFERENCES public.users(id),
  reviewed_at       timestamptz,
  paid_at           timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sweep_payment_requests_tribe ON public.sweep_payment_requests (tribe_id);
CREATE INDEX IF NOT EXISTS idx_sweep_payment_requests_comp  ON public.sweep_payment_requests (comp_id);
CREATE INDEX IF NOT EXISTS idx_sweep_payment_requests_user  ON public.sweep_payment_requests (user_id);

CREATE OR REPLACE FUNCTION public.set_sweep_payment_request_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_sweep_payment_requests_updated_at ON public.sweep_payment_requests;
CREATE TRIGGER trg_sweep_payment_requests_updated_at
  BEFORE UPDATE ON public.sweep_payment_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_sweep_payment_request_updated_at();

-- RLS mirrors comp_payments exactly. Real authorization lives in the API routes (service-role
-- client) — this is defense-in-depth per CLAUDE.md, not the primary gate.
ALTER TABLE public.sweep_payment_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comp_admins_manage_sweep_requests" ON public.sweep_payment_requests;
CREATE POLICY "comp_admins_manage_sweep_requests" ON public.sweep_payment_requests FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.comp_admins ca WHERE ca.comp_id = sweep_payment_requests.comp_id AND ca.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "users_view_own_sweep_requests" ON public.sweep_payment_requests;
CREATE POLICY "users_view_own_sweep_requests" ON public.sweep_payment_requests FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "users_create_own_sweep_requests" ON public.sweep_payment_requests;
CREATE POLICY "users_create_own_sweep_requests" ON public.sweep_payment_requests FOR INSERT
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sweep_payment_requests TO anon, authenticated;
GRANT ALL ON TABLE public.sweep_payment_requests TO service_role;

SELECT 'Migration 193 complete — sweep_payment_requests table added' AS status;
