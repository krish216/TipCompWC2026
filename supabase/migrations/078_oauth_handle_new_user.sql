-- Migration 078 — update handle_new_user for Google / Apple OAuth
-- Google sets full_name / name / avatar_url in raw_user_meta_data (not display_name).
-- This update makes the trigger populate those fields so OAuth sign-ups get a
-- proper display name and avatar without needing a registration form.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, display_name, avatar_url, onboarding_complete)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'display_name'), ''),
      NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
      NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
      SPLIT_PART(NEW.email, '@', 1)
    ),
    NULLIF(TRIM(NEW.raw_user_meta_data->>'avatar_url'), ''),
    false
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

SELECT 'Migration 078 complete — handle_new_user updated for OAuth providers' AS status;
