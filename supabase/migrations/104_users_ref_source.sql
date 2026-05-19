-- Migration 104 — Add ref_source column to users
-- Records the ?ref= acquisition parameter from the signup URL (e.g. ?ref=wom).
-- Populated at registration time; NULL for users who signed up without a ref.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS ref_source TEXT;

SELECT 'Migration 104 complete — ref_source column added to users' AS status;
