-- Migration 063: drop unused round_id enum type
-- The round_id enum (gs, r32, r16, qf, sf, tp, f) was the original
-- type for fixtures.round and predictions.round columns.
-- These were converted to text in earlier migrations.
-- No columns reference this type anymore (verified via information_schema).
-- Dropping it removes the hardcoded constraint and allows any round_code
-- to be used in fixtures and predictions going forward.

-- Safety check: confirm no columns use round_id before dropping
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE udt_name = 'round_id' AND table_schema = 'public'
  ) THEN
    RAISE EXCEPTION 'round_id type still in use — do not drop';
  END IF;
END $$;

DROP TYPE IF EXISTS public.round_id;

SELECT 'Migration 063 complete — round_id enum dropped' AS status;
