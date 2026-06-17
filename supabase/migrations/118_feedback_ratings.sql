-- Migration 118 — feedback ratings
--
-- A) helpful_count: public "👍 Helpful" reactions on published responses (the
--    "Updates from us" wall). Incremented via the admin/service-role client.
-- B) response_rating: the original submitter's verdict on the admin's reply to
--    THEIR feedback ('up' = resolved/helpful, 'down' = not). Closes the loop.
-- feedback reads/writes flow through the service-role client (RLS, no public
-- policies), so no additional grants are required here.

ALTER TABLE public.feedback
  ADD COLUMN IF NOT EXISTS helpful_count   integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS response_rating text,
  ADD COLUMN IF NOT EXISTS rated_at        timestamptz;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feedback_response_rating_chk') THEN
    ALTER TABLE public.feedback
      ADD CONSTRAINT feedback_response_rating_chk
      CHECK (response_rating IS NULL OR response_rating IN ('up', 'down'));
  END IF;
END $$;

SELECT '118 complete — feedback ratings (helpful_count, response_rating) added' AS status;
