-- 143: optional description/subtext for a poll (rendered under the question, with
-- clickable links). Lets a poll carry context + a CTA link without bloating the
-- question itself.

ALTER TABLE public.polls
  ADD COLUMN IF NOT EXISTS description text;
