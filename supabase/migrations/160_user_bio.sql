-- 160: users.bio — a short public blurb for the Comp-Chief profile page
--
-- Chiefs get a public profile (/chief/[id]) so prospective members can vet who runs an
-- open comp before joining. `bio` is the one new field that page needs; everything else
-- (display_name, avatar_url, country, created_at) already exists. Optional, free-text,
-- shown publicly — keep it short.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS bio text;

COMMENT ON COLUMN public.users.bio IS 'Short public blurb shown on the Comp-Chief profile page (/chief/[id]).';

SELECT 'Migration 160 complete — users.bio added' AS status;
