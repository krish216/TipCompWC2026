-- Migration 111: donations table
-- Records one-off Stripe donations made via the "Support TribePicks" Payment Link.
-- A donation grants no entitlement (unlike premium) — this is purely a record so we
-- can recognise supporters later (e.g. a "Supporter" badge). The Stripe webhook
-- (service-role) writes rows; signed-in donors are attributed via client_reference_id.

CREATE TABLE IF NOT EXISTS public.donations (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- null = anonymous donor
  email                  text,
  amount_cents           integer NOT NULL,
  currency               text    NOT NULL DEFAULT 'aud',
  stripe_session_id      text    UNIQUE,                                     -- idempotency key for webhook retries
  stripe_payment_intent  text,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS donations_user_id_idx ON public.donations (user_id);

ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;

-- Donors may read their own donation rows (for a future "Supporter" badge).
-- Inserts happen only via the service-role webhook, which bypasses RLS — so there is
-- deliberately no INSERT/UPDATE/DELETE policy for anon/authenticated.
CREATE POLICY "donations_select_own" ON public.donations
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Explicit PostgREST grants (required — see CLAUDE.md). SELECT is row-limited by RLS;
-- writes are service-role only.
GRANT SELECT ON TABLE public.donations TO anon, authenticated;
GRANT ALL    ON TABLE public.donations TO service_role;
