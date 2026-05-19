-- Migration 105 — Add signup attribution columns to users
-- role:         'tipster' | 'organiser' — the role the user selected at registration
-- signup_flow:  'organic' | 'invite' | 'challenge' | 'bracket' — what triggered the signup

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role        TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS signup_flow TEXT;

SELECT 'Migration 105 complete — role and signup_flow columns added to users' AS status;
