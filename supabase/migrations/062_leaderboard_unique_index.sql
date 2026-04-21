-- Migration 062: add unique index to leaderboard materialized view
-- Required for REFRESH MATERIALIZED VIEW CONCURRENTLY to work.
-- Without this index, concurrent refresh fails and the scoring trigger
-- can return error "cannot refresh materialized view concurrently".

CREATE UNIQUE INDEX IF NOT EXISTS leaderboard_unique_idx
  ON public.leaderboard (user_id, tournament_id);

SELECT 'Migration 062 complete — unique index on leaderboard(user_id, tournament_id)' AS status;
