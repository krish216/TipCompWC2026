-- Migration 108 — add contact_email to feedback
--
-- Allows unsigned users to optionally leave an email address so we can follow up.

ALTER TABLE public.feedback
  ADD COLUMN IF NOT EXISTS contact_email text;

SELECT '108 complete — contact_email added to feedback' AS status;
