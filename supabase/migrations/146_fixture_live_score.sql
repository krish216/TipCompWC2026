-- 146_fixture_live_score.sql
-- In-progress ("live") score for a fixture, stored SEPARATELY from the final
-- home_score/away_score so the scoring trigger (which fires on home_score/away_score/
-- pen_winner/result_outcome) is NOT triggered mid-match. The scores cron writes these
-- for in-progress matches; the single-match challenge leaderboard uses them to show a
-- provisional "if it ended now" ranking. Cleared/settled to 'ft' when the final result
-- lands. No new table, so existing grants (migration 110) already cover these columns.

ALTER TABLE public.fixtures
  ADD COLUMN IF NOT EXISTS live_home_score smallint,
  ADD COLUMN IF NOT EXISTS live_away_score smallint,
  ADD COLUMN IF NOT EXISTS live_status     text,        -- 'in' (playing) | 'ht' (half-time) | 'ft' (full-time) | null
  ADD COLUMN IF NOT EXISTS live_minute     smallint,    -- match clock in minutes
  ADD COLUMN IF NOT EXISTS live_updated_at timestamptz; -- last time the live score was refreshed
