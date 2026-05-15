-- Migration 099 — bracket_predictions: analytics columns
--
-- Adds acquisition and engagement stats to the existing one-row-per-user-per-tournament table.

ALTER TABLE public.bracket_predictions
  ADD COLUMN IF NOT EXISTS sf_loser_1        text,         -- team eliminated in SF1
  ADD COLUMN IF NOT EXISTS sf_loser_2        text,         -- team eliminated in SF2
  ADD COLUMN IF NOT EXISTS source            text,         -- referral channel (?ref= URL param)
  ADD COLUMN IF NOT EXISTS completed_at      timestamptz,  -- first time champion was set
  ADD COLUMN IF NOT EXISTS share_count       int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_share_format text,         -- portrait | landscape | square
  ADD COLUMN IF NOT EXISTS device            text;         -- mobile | desktop

SELECT '099 complete — bracket_predictions analytics columns added' AS status;
