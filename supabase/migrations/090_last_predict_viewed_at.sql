-- Track when the user last viewed their predictions page.
-- Used to compute "X results landed since your last visit" nudge on the homepage.
ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS last_predict_viewed_at timestamptz;
