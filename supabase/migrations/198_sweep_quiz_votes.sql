-- Migration 198: sweep_quiz_votes — answers to the tongue-in-cheek quiz at /quiz/australia
-- ("What's the biggest problem facing Australia right now?"), so the page can show what
-- share of visitors picked each answer.
--
-- Anonymous: voter_id is a random id the browser generates and keeps in localStorage — not
-- linked to any account. One vote per voter per quiz; a repeat vote is ignored.
--
-- RLS on with no policies: only the service-role client (the API route) reads or writes,
-- and it only ever returns totals.

CREATE TABLE IF NOT EXISTS public.sweep_quiz_votes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz        text NOT NULL,
  voter_id    text NOT NULL,
  answer      text NOT NULL CHECK (answer IN ('cost_of_living', 'housing', 'economy', 'crime', 'melbourne_cup')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (quiz, voter_id)
);

ALTER TABLE public.sweep_quiz_votes ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sweep_quiz_votes TO anon, authenticated;
GRANT ALL ON TABLE public.sweep_quiz_votes TO service_role;
