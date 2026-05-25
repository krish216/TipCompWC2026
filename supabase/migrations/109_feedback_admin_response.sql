-- Migration 109 — admin response fields on feedback
--
-- Admins can write a response and choose to publish it publicly.

ALTER TABLE public.feedback
  ADD COLUMN IF NOT EXISTS admin_response  text,
  ADD COLUMN IF NOT EXISTS response_at     timestamptz,
  ADD COLUMN IF NOT EXISTS show_response   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS responded_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS feedback_show_response_idx ON public.feedback (show_response) WHERE show_response = true;

SELECT '109 complete — admin_response fields added to feedback' AS status;
