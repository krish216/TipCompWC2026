-- 148_challenge_target_timezones.sql
-- Optional geo-targeting for a challenge's promo card: when non-empty, the promo is
-- only shown to signed-in users whose profile timezone is in this list (e.g. target
-- the sponsored Ray White bracket challenge at Sydney tippers on the prediction page).
-- Empty (default) = shown to everyone, as before. No new table → migration 110 grants
-- already cover this column.

ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS target_timezones text[] NOT NULL DEFAULT '{}';
