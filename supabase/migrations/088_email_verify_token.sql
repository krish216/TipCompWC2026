-- Add custom email verification token columns (replacing Supabase magic links)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS email_verify_token text,
  ADD COLUMN IF NOT EXISTS email_verify_token_expires_at timestamptz;
