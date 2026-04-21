-- Migration 054: participation fee flag + comp_payments table

-- 1. Add fee settings to comps table
ALTER TABLE public.comps
  ADD COLUMN IF NOT EXISTS requires_payment_fee boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS entry_fee_amount      numeric(10,2);

-- 2. Payments ledger — one row per (comp, user)
CREATE TABLE IF NOT EXISTS public.comp_payments (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  comp_id      uuid        NOT NULL REFERENCES public.comps(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  paid         boolean     NOT NULL DEFAULT false,
  paid_at      timestamptz,
  amount       numeric(10,2),          -- actual amount paid (may differ from comp entry_fee)
  notes        text,                   -- e.g. "paid via bank transfer"
  recorded_by  uuid        REFERENCES public.users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comp_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_comp_payments_comp_id ON public.comp_payments (comp_id);
CREATE INDEX IF NOT EXISTS idx_comp_payments_user_id ON public.comp_payments (user_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_comp_payment_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS trg_comp_payments_updated_at ON public.comp_payments;
CREATE TRIGGER trg_comp_payments_updated_at
  BEFORE UPDATE ON public.comp_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_comp_payment_updated_at();

-- RLS: comp admins and tournament admins can read/write payments
ALTER TABLE public.comp_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comp_admins_manage_payments" ON public.comp_payments;
CREATE POLICY "comp_admins_manage_payments"
  ON public.comp_payments FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.comp_admins ca WHERE ca.comp_id = comp_payments.comp_id AND ca.user_id = auth.uid())
    OR
    EXISTS (SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid())
  );

-- Users can view their own payment record (read-only)
DROP POLICY IF EXISTS "users_view_own_payment" ON public.comp_payments;
CREATE POLICY "users_view_own_payment"
  ON public.comp_payments FOR SELECT
  USING (user_id = auth.uid());

-- When a new user joins a comp that requires payment, auto-create a payment record
CREATE OR REPLACE FUNCTION public.init_comp_payment_on_join()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_requires boolean; v_fee numeric;
BEGIN
  SELECT requires_payment_fee, entry_fee_amount
  INTO   v_requires, v_fee
  FROM   public.comps WHERE id = NEW.comp_id;

  IF v_requires THEN
    INSERT INTO public.comp_payments (comp_id, user_id, paid, amount)
    VALUES (NEW.comp_id, NEW.user_id, false, v_fee)
    ON CONFLICT (comp_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_init_comp_payment ON public.user_comps;
CREATE TRIGGER trg_init_comp_payment
  AFTER INSERT ON public.user_comps
  FOR EACH ROW EXECUTE FUNCTION public.init_comp_payment_on_join();

SELECT 'Migration 054 complete — comp_payments table + fee columns added' AS status;
