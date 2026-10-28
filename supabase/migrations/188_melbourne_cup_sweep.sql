-- 188: Melbourne Cup digital sweep — schema only (see docs/plans/melbourne-cup-sweep-plan.md).
--
-- A sweep is a tournaments row (format='sweep'), reusing comps/tribes exactly as WC/EPL
-- do: an organisation is a comp, each tribe under it is an independent pool/draw. Net-new
-- is just the shared race field (sweep_horses, one per tournament, entered centrally) and
-- the per-tribe draw (sweep_entries).
--
-- is_active = FALSE, deliberately and permanently for this tournament: ~10 call sites
-- (leaderboard, predictions, fixtures, UserPrefsContext, challenges, polls, sponsors,
-- weekly-report cron) assume exactly one is_active=true tournament, and EPL already holds
-- that slot for real live traffic. The sweep is reached via its own slug-scoped routes
-- (same pattern as /epl), never the generic tournament-switcher, so this is never flipped.

-- 1. Widen tournaments.format (migration 159 CHECK only allowed 'league'/'knockout').
ALTER TABLE public.tournaments DROP CONSTRAINT IF EXISTS tournaments_format_check;
ALTER TABLE public.tournaments ADD CONSTRAINT tournaments_format_check
  CHECK (format IN ('league', 'knockout', 'sweep'));

-- 2. The race itself.
INSERT INTO public.tournaments (slug, name, format, start_date, end_date, is_active, is_primary)
VALUES ('melbourne-cup-2026', 'Melbourne Cup 2026', 'sweep', '2026-11-03', '2026-11-03', false, false)
ON CONFLICT (slug) DO NOTHING;

-- 3. The shared race field — one row per horse, entered centrally (platform admin) once
-- the final field is published. scratched flips as scratchings are announced up to race
-- morning. finish_position is set once, after the race: 1/2/3 = placegetters.
CREATE TABLE IF NOT EXISTS public.sweep_horses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id   uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  number          int NOT NULL,
  name            text NOT NULL,
  scratched       boolean NOT NULL DEFAULT false,
  finish_position int,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, number)
);

-- 4. The draw — one row per entrant, scoped to their TRIBE (pool), not the comp, so the
-- same horse can land with different users in different tribes. horse_id is null until
-- that tribe's "lock & draw" runs.
CREATE TABLE IF NOT EXISTS public.sweep_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id    uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  horse_id    uuid REFERENCES public.sweep_horses(id),
  joined_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tribe_id, user_id),
  UNIQUE (tribe_id, horse_id)
);

-- 5. Lock/draw state lives on the tribe — each tribe draws independently.
ALTER TABLE public.tribes
  ADD COLUMN IF NOT EXISTS sweep_locked_at timestamptz;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.sweep_horses, public.sweep_entries TO anon, authenticated;
GRANT ALL ON TABLE public.sweep_horses, public.sweep_entries TO service_role;

-- Verify
SELECT id, slug, format, is_active FROM public.tournaments WHERE slug = 'melbourne-cup-2026';
SELECT 'Migration 188 complete — Melbourne Cup sweep schema (format widened, tournament seeded, sweep_horses + sweep_entries + tribes.sweep_locked_at)' AS status;
