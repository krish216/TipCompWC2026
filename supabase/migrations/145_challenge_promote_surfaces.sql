-- 145: advertise a challenge via a dismissible promo card on selected app surfaces.
-- promote_surfaces holds surface keys the challenge should be advertised on
-- (e.g. {'home','scoreboard'}). Empty = not promoted anywhere.

ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS promote_surfaces text[] NOT NULL DEFAULT '{}';
