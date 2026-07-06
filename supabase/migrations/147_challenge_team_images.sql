-- 147_challenge_team_images.sql
-- Optional custom per-team visuals for a challenge (e.g. a themed match challenge:
-- Argentina as the Dogo Argentino, Egypt as the Sphinx). When set, the match hero,
-- OG share card, and leaderboard render these images instead of the flag emojis.
-- Stored in the public org-logos bucket under challenges/{slug}/{side}.{ext}.
-- No new table, so existing grants (migration 110) already cover these columns.

ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS home_image_url text,
  ADD COLUMN IF NOT EXISTS away_image_url text;
