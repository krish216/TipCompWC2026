-- 165: users.tagline — a short one-line headline for the Comp-Chief profile
--
-- Sits under the name on /chief/[id], distinct from the longer `bio`. Editable by the
-- Chief in Settings. Keep it short (UI caps ~80 chars).

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS tagline text;

COMMENT ON COLUMN public.users.tagline IS 'Short one-line headline shown under the name on the Comp-Chief profile.';

SELECT 'Migration 165 complete — users.tagline added' AS status;
