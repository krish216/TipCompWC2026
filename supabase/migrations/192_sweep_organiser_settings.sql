-- 192: sweep-organiser settings. Live on `comps` (same comp-level-settings idiom as
-- max_tribes/tribes_closed_at, migration 189) — a "sweep an organiser runs" is a comp in
-- this app's model, so these settings are comp-scoped even though they're only meaningful
-- for sweep-format comps (harmless/unused for league/knockout comps, same precedent as
-- requires_payment_fee).
ALTER TABLE public.comps
  ADD COLUMN IF NOT EXISTS allow_iou            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sweep_approval_mode  text    NOT NULL DEFAULT 'manual'
    CHECK (sweep_approval_mode IN ('manual', 'auto')),
  ADD COLUMN IF NOT EXISTS sweep_reveal_mode    text    NOT NULL DEFAULT 'immediate'
    CHECK (sweep_reveal_mode IN ('immediate', 'on_full_draw')),
  ADD COLUMN IF NOT EXISTS sweep_leftover_mode  text    NOT NULL DEFAULT 'none'
    CHECK (sweep_leftover_mode IN ('none', 'auto_assign_organiser'));

-- Idempotency guard for the results email (Phase 9) — a tribe's podium can be edited after
-- the fact (a finish-position correction); this stops a second edit from re-emailing
-- everyone.
ALTER TABLE public.tribes ADD COLUMN IF NOT EXISTS sweep_results_sent_at timestamptz;

SELECT 'Migration 192 complete — comps sweep-organiser settings + tribes.sweep_results_sent_at added' AS status;
