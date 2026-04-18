-- Migration 055: add first_name and last_name to users table
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name  text;

SELECT 'Migration 055 complete — first_name, last_name added to users' AS status;
