-- Migration 112: external API fixture id for reliable result auto-sync
-- Stores the API-Football (v3) fixture.id against each local fixture so the
-- /api/scores/sync cron can fetch results by id instead of fuzzy team-name
-- matching. Populated once (with admin review) via /api/admin/map-fixtures.

ALTER TABLE public.fixtures
  ADD COLUMN IF NOT EXISTS api_fixture_id integer;

-- One local fixture per external id. Partial index so the many not-yet-mapped
-- rows (NULL) don't collide.
CREATE UNIQUE INDEX IF NOT EXISTS fixtures_api_fixture_id_key
  ON public.fixtures (api_fixture_id)
  WHERE api_fixture_id IS NOT NULL;

COMMENT ON COLUMN public.fixtures.api_fixture_id IS
  'API-Football v3 fixture.id — populated via /api/admin/map-fixtures; used by /api/scores/sync to fetch results by id.';
