-- Migration 067 — rebuild round_locks as tournament-scoped with FK to tournament_rounds
--
-- Old design: global table keyed by free-text `round` — no tournament link, no referential
--             integrity against tournament_rounds.
-- New design: (tournament_id, round_code) unique pair; round_code must exist in
--             tournament_rounds for that tournament (composite FK).

-- ── 1. Drop the old table ────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.round_locks CASCADE;

-- ── 2. Create new table ──────────────────────────────────────────────────────
CREATE TABLE public.round_locks (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id  uuid        NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  round_code     text        NOT NULL,
  is_open        boolean     NOT NULL DEFAULT false,
  opened_at      timestamptz,
  opened_by      uuid        REFERENCES public.users(id),

  CONSTRAINT round_locks_unique    UNIQUE  (tournament_id, round_code),
  CONSTRAINT round_locks_valid_round
    FOREIGN KEY (tournament_id, round_code)
    REFERENCES public.tournament_rounds (tournament_id, round_code)
    ON DELETE CASCADE
);

CREATE INDEX round_locks_tournament
  ON public.round_locks (tournament_id);

-- ── 3. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE public.round_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "round_locks_public_read"
  ON public.round_locks FOR SELECT USING (true);

-- ── 4. Seed WC2026 — one row per round, gs open by default ──────────────────
INSERT INTO public.round_locks (tournament_id, round_code, is_open)
SELECT
  tr.tournament_id,
  tr.round_code,
  tr.round_code = 'gs'    -- group stage open by default
FROM public.tournament_rounds tr
JOIN public.tournaments t ON t.id = tr.tournament_id
WHERE t.slug = 'wc2026'
ON CONFLICT (tournament_id, round_code) DO NOTHING;

-- Verify
SELECT t.slug, rl.round_code, rl.is_open
FROM public.round_locks rl
JOIN public.tournaments t ON t.id = rl.tournament_id
ORDER BY t.slug, rl.round_code;

SELECT 'Migration 067 complete — round_locks rebuilt with tournament_id + FK to tournament_rounds' AS status;
