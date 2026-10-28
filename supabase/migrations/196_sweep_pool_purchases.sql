-- Migration 196: sweep_pool_purchases — organisers buying sweep pools from TribePicks.
--
-- The payment seam for sweeps: every pool beyond the free allowance is bought through a
-- purchase row, whichever provider handles it ('free' while billing is switched off,
-- 'stripe' once it's on, 'admin' for a platform-admin comp). A purchase only raises
-- comps.max_tribes when it's fulfilled (status -> 'paid'), so the pool cap can't be
-- raised without a paid row behind it. See src/lib/sweep/billing.ts.
--
-- Organiser money, so no public access at all: RLS on with no policies; only the
-- service-role client (API routes) reads or writes it.

CREATE TABLE IF NOT EXISTS public.sweep_pool_purchases (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comp_id           uuid NOT NULL REFERENCES public.comps(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  pools             int  NOT NULL CHECK (pools BETWEEN 1 AND 5),
  amount_cents      int  NOT NULL CHECK (amount_cents >= 0),
  currency          text NOT NULL DEFAULT 'aud',
  provider          text NOT NULL CHECK (provider IN ('free', 'stripe', 'admin')),
  status            text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  stripe_session_id text UNIQUE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  paid_at           timestamptz
);

CREATE INDEX IF NOT EXISTS sweep_pool_purchases_comp_idx ON public.sweep_pool_purchases (comp_id);

ALTER TABLE public.sweep_pool_purchases ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sweep_pool_purchases TO anon, authenticated;
GRANT ALL ON TABLE public.sweep_pool_purchases TO service_role;
