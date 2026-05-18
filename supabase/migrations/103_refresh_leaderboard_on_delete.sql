-- Migration 103 — Refresh leaderboard materialized views after prediction deletes
--
-- Problem: trg_refresh_lb fires AFTER UPDATE OF points_earned, so bulk-deleting
-- predictions (e.g. Practice Again) never triggers a refresh. The materialized
-- views retain stale aggregated points until the next UPDATE-based refresh.
--
-- Fix: Add a STATEMENT-level DELETE trigger that calls the same refresh_leaderboard()
-- function already used by the UPDATE trigger. FOR EACH STATEMENT means one refresh
-- per DELETE batch, not one per deleted row.

CREATE OR REPLACE TRIGGER trg_refresh_lb_on_delete
AFTER DELETE ON public.predictions
FOR EACH STATEMENT EXECUTE FUNCTION refresh_leaderboard();

SELECT 'Migration 103 complete — leaderboard refresh trigger added for DELETE on predictions' AS status;
