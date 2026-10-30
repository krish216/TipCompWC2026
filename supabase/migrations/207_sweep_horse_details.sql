-- 207_sweep_horse_details.sql
-- The race-card details for each horse, shown in the pool's "By horse" view (the sweep
-- sheet): barrier, jockey, trainer and carried weight. Entered with the field on
-- /admin/sweep-horses ("number, name, barrier, jockey, trainer, weight" per line), after the
-- barrier draw. All optional — the practice field and older fields simply leave them blank.
-- Betting odds are deliberately not stored: they change by the minute and a random draw
-- shouldn't invite "my horse is a dud".
--
-- Columns on an existing table, so no new PostgREST grants are needed.

ALTER TABLE public.sweep_horses
  ADD COLUMN IF NOT EXISTS barrier   integer,
  ADD COLUMN IF NOT EXISTS jockey    text,
  ADD COLUMN IF NOT EXISTS trainer   text,
  ADD COLUMN IF NOT EXISTS weight_kg numeric(4,1);
