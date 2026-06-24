-- Migration 129 — fixture_pick_stats: tournament-wide H/D/A pick distribution per
-- fixture, for the Tipster "Tip Review" (how you tipped vs the field). MOCK USERS
-- EXCLUDED (email LIKE 'mockuser%') — seed accounts otherwise flatten every signal
-- toward random (e.g. a 90%-backed favourite looks like 72%). Picks are outcome-based
-- (W/D/L); use predictions.outcome, falling back to the scoreline sign for old rows.
--
-- Picks freeze at kickoff, so a settled fixture's distribution is final — refreshing
-- on the 5-min scores cron (via refresh_fixture_pick_stats()) keeps it fresh enough.
-- Read by the API through the service-role client, so no PostgREST grants needed.

DROP MATERIALIZED VIEW IF EXISTS public.fixture_pick_stats CASCADE;

CREATE MATERIALIZED VIEW public.fixture_pick_stats AS
WITH norm AS (
  SELECT
    p.fixture_id,
    COALESCE(
      p.outcome,
      CASE WHEN p.home > p.away THEN 'H'
           WHEN p.home < p.away THEN 'A'
           ELSE 'D' END
    ) AS o
  FROM public.predictions p
  JOIN public.users u ON u.id = p.user_id
  WHERE u.email NOT LIKE 'mockuser%'
)
SELECT
  fixture_id,
  COUNT(*) FILTER (WHERE o = 'H')::int AS h,
  COUNT(*) FILTER (WHERE o = 'D')::int AS d,
  COUNT(*) FILTER (WHERE o = 'A')::int AS a,
  COUNT(*)::int                        AS total
FROM norm
GROUP BY fixture_id;

-- Unique index required for REFRESH ... CONCURRENTLY
CREATE UNIQUE INDEX fixture_pick_stats_fixture ON public.fixture_pick_stats (fixture_id);

REFRESH MATERIALIZED VIEW public.fixture_pick_stats;

-- Resilient refresh, callable from the scores-sync cron via supabase-js rpc().
CREATE OR REPLACE FUNCTION public.refresh_fixture_pick_stats()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.fixture_pick_stats;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fixture_pick_stats refresh skipped: %', SQLERRM;
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_fixture_pick_stats() TO service_role;

SELECT '129 complete — fixture_pick_stats built (mock excluded) + refresh fn' AS status,
       count(*) AS fixtures_with_picks FROM public.fixture_pick_stats;
