-- Migration 102 — feedback
--
-- Stores in-app feedback submitted via the floating feedback button.
-- Reads are service-role only; inserts flow through the admin client in /api/feedback.

CREATE TABLE IF NOT EXISTS public.feedback (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  user_id     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  category    text        NOT NULL CHECK (category IN ('bug', 'suggestion', 'other')),
  message     text        NOT NULL,
  page_url    text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feedback_pkey PRIMARY KEY (id)
);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

SELECT '102 complete — feedback table created' AS status;
