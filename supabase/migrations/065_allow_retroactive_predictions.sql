-- Allow tournament admins to enable retroactive predictions (for testing/onboarding)
ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS allow_retroactive_predictions boolean NOT NULL DEFAULT false;
