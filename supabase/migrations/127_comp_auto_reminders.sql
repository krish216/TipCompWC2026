-- 127: CompChief Pro — automated tip reminders.
--
-- A Comp Chief can switch on scheduled "you haven't tipped" reminders to their own
-- members before each round locks (the set-and-forget version of the manual nudge).
-- Pro feature (gated in the cron on the comp owner's is_premium). Sends are deduped
-- per (comp, round, lead window) so a member gets each reminder at most once.

ALTER TABLE public.comps ADD COLUMN IF NOT EXISTS auto_reminder text NOT NULL DEFAULT 'off';
-- auto_reminder ∈ {'off','24h','3h','both'}

CREATE TABLE IF NOT EXISTS public.comp_reminders_sent (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comp_id       uuid NOT NULL REFERENCES public.comps(id) ON DELETE CASCADE,
  round_code    text NOT NULL,
  window_hours  smallint NOT NULL,
  sent_count    integer NOT NULL DEFAULT 0,
  sent_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (comp_id, round_code, window_hours)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.comp_reminders_sent TO anon, authenticated;
GRANT ALL ON TABLE public.comp_reminders_sent TO service_role;

ALTER TABLE public.comp_reminders_sent ENABLE ROW LEVEL SECURITY;
-- Service-role only (cron writes it); no public policies.
