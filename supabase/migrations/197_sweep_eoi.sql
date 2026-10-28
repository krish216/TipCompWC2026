-- Migration 197: sweep_eoi — expressions of interest from the public /melbourne-cup page.
--
-- Two kinds of lead on one table:
--   intent = 'organise' — someone who'd run a sweep (organisation, rough head count, pools)
--   intent = 'join'     — someone without an organiser who'd like a sweep to join (tickets)
-- One row per email per tournament per intent: resubmitting updates the row instead of
-- piling up duplicates.
--
-- Personal details from the public, so no public access at all: RLS on with no policies;
-- only the service-role client (the API route) reads or writes it.

CREATE TABLE IF NOT EXISTS public.sweep_eoi (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id  uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  intent         text NOT NULL CHECK (intent IN ('organise', 'join')),
  name           text NOT NULL,
  email          text NOT NULL,
  organisation   text,
  group_size     int  CHECK (group_size BETWEEN 1 AND 10000),
  pools          int  CHECK (pools BETWEEN 1 AND 5),
  tickets        int  CHECK (tickets BETWEEN 1 AND 24),
  notes          text,
  user_id        uuid REFERENCES public.users(id) ON DELETE SET NULL,
  source         text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, intent, email)
);

ALTER TABLE public.sweep_eoi ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sweep_eoi TO anon, authenticated;
GRANT ALL ON TABLE public.sweep_eoi TO service_role;
