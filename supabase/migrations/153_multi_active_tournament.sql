-- 153: multi-active-tournament support
--
-- Layer 1 — a deterministic "primary" active tournament. ~17 code paths resolved the
-- current tournament with `.eq('is_active',true).maybeSingle()`, which ERRORS on >1 row.
-- That made it impossible to have two tournaments active at once (needed for the
-- WC→EPL handover and the multi-tournament switcher). A single `is_primary` flag gives
-- a deterministic default; the shared getPrimaryTournament() helper reads it with
-- `.limit(1).maybeSingle()` so multiple active tournaments never error.
--
-- Also: per-(user,tournament) remembered comp selection, so switching tournaments
-- restores the comp you last used there instead of resetting to none.

-- ── Primary tournament flag ──────────────────────────────────────────────────
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;

-- WC is the current default/primary tournament.
UPDATE public.tournaments SET is_primary = true WHERE slug = 'wc2026';

-- At most one primary at a time (partial unique index on the TRUE rows).
CREATE UNIQUE INDEX IF NOT EXISTS tournaments_one_primary
  ON public.tournaments (is_primary) WHERE is_primary;

-- ── Per-tournament comp memory ───────────────────────────────────────────────
ALTER TABLE public.user_tournaments
  ADD COLUMN IF NOT EXISTS selected_comp_id uuid;

SELECT 'Migration 153 complete — is_primary flag + per-tournament selected_comp_id' AS status;
