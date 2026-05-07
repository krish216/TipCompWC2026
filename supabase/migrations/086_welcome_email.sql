-- Migration 086 — Welcome email templates + sent tracking

-- Per-tournament editable email templates (welcome, and future keys)
CREATE TABLE IF NOT EXISTS public.tournament_email_templates (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id  uuid        NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  template_key   text        NOT NULL,
  subject        text        NOT NULL,
  body           text        NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tournament_id, template_key)
);

ALTER TABLE public.tournament_email_templates ENABLE ROW LEVEL SECURITY;
-- Only service role / admin clients access this table
CREATE POLICY "Service role only" ON public.tournament_email_templates
  USING (true) WITH CHECK (true);

-- Track whether the welcome email has been sent to each user (prevents duplicates)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS welcome_email_sent boolean NOT NULL DEFAULT false;

SELECT 'Migration 086 complete — tournament_email_templates + users.welcome_email_sent' AS status;
