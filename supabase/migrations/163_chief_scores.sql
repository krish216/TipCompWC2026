-- 163: chief_scores — nightly reputation ranking for Comp-Chiefs (Phase 1b)
--
-- The composite "Chief Score" that powers the profile rank pin ("#7 · Top 4% in AU").
-- Deliberately rewards STEWARDSHIP, not headcount, so it can't be gamed by importing a
-- big dead list. Four components, blended and bounded:
--   reach 30%      log-scaled ACTIVE tipsters (members who actually tip) — size, de-emphasised
--   retention 30%  members who came back across ≥2 of the Chief's tournaments / led
--   engagement 25% active tipsters / total led — how alive the tribe is
--   growth 15%     log-scaled members who joined in the last 90 days
-- Ranks are computed only over ELIGIBLE Chiefs (≥5 active tipsters) so noise/test comps
-- don't clutter the board; everyone else still gets a score row with null rank.
--
-- Heavy (cohort-wide predictions scan) → a materialized view refreshed nightly, never
-- computed per page view. Read by /chief/[id] via a cheap indexed lookup.

DROP MATERIALIZED VIEW IF EXISTS public.chief_scores CASCADE;

CREATE MATERIALIZED VIEW public.chief_scores AS
WITH chief_comps AS (
  SELECT c.created_by AS chief_id, c.id AS comp_id, c.tournament_id
  FROM public.comps c
  WHERE c.created_by IS NOT NULL
),
comps_cnt AS (
  SELECT chief_id, COUNT(*) AS comps_run FROM chief_comps GROUP BY chief_id
),
-- distinct (chief, member, tournament) — the basis for led / seasons / retention
membership AS (
  SELECT DISTINCT cc.chief_id, uc.user_id, cc.tournament_id
  FROM chief_comps cc
  JOIN public.user_comps uc ON uc.comp_id = cc.comp_id
),
led AS (
  SELECT chief_id,
         COUNT(DISTINCT user_id)       AS tipsters_led,
         COUNT(DISTINCT tournament_id) AS seasons
  FROM membership GROUP BY chief_id
),
active AS (
  SELECT m.chief_id, COUNT(DISTINCT m.user_id) AS active_tipsters
  FROM membership m
  WHERE EXISTS (
    SELECT 1 FROM public.predictions p
    WHERE p.user_id = m.user_id AND p.tournament_id = m.tournament_id
  )
  GROUP BY m.chief_id
),
retained AS (
  SELECT chief_id, COUNT(*) AS returning_tipsters
  FROM (
    SELECT chief_id, user_id
    FROM membership
    GROUP BY chief_id, user_id
    HAVING COUNT(DISTINCT tournament_id) >= 2
  ) r GROUP BY chief_id
),
recent AS (
  SELECT cc.chief_id, COUNT(DISTINCT uc.user_id) AS recent_joins
  FROM chief_comps cc
  JOIN public.user_comps uc ON uc.comp_id = cc.comp_id
  WHERE uc.joined_at > now() - interval '90 days'
  GROUP BY cc.chief_id
),
scored AS (
  SELECT
    l.chief_id,
    u.country,
    cc.comps_run,
    l.tipsters_led,
    l.seasons,
    COALESCE(a.active_tipsters, 0)     AS active_tipsters,
    COALESCE(r.returning_tipsters, 0)  AS returning_tipsters,
    COALESCE(rc.recent_joins, 0)       AS recent_joins,
    ROUND((100.0 * (
        0.30 * LEAST(1.0, ln(1 + COALESCE(a.active_tipsters,0)) / ln(501))          -- reach
      + 0.30 * (COALESCE(r.returning_tipsters,0)::numeric / NULLIF(l.tipsters_led,0)) -- retention
      + 0.25 * (COALESCE(a.active_tipsters,0)::numeric   / NULLIF(l.tipsters_led,0))  -- engagement
      + 0.15 * LEAST(1.0, ln(1 + COALESCE(rc.recent_joins,0)) / ln(101))            -- growth
    ))::numeric, 1) AS score
  FROM led l
  JOIN public.users u        ON u.id = l.chief_id
  JOIN comps_cnt cc          ON cc.chief_id = l.chief_id
  LEFT JOIN active a         ON a.chief_id = l.chief_id
  LEFT JOIN retained r       ON r.chief_id = l.chief_id
  LEFT JOIN recent rc        ON rc.chief_id = l.chief_id
),
ranked AS (   -- ranks computed only over eligible Chiefs (≥5 active tipsters)
  SELECT chief_id,
         RANK()  OVER (ORDER BY score DESC)                          AS rank_global,
         COUNT(*) OVER ()                                            AS total_global,
         RANK()  OVER (PARTITION BY country ORDER BY score DESC)     AS rank_country,
         COUNT(*) OVER (PARTITION BY country)                        AS total_country
  FROM scored WHERE active_tipsters >= 5
)
SELECT
  s.*,
  rk.rank_global, rk.total_global, rk.rank_country, rk.total_country,
  CEIL(100.0 * rk.rank_global  / NULLIF(rk.total_global, 0))::int AS top_pct_global,
  CASE WHEN s.country IS NOT NULL
       THEN CEIL(100.0 * rk.rank_country / NULLIF(rk.total_country, 0))::int END AS top_pct_country
FROM scored s
LEFT JOIN ranked rk ON rk.chief_id = s.chief_id;

-- Unique index required for REFRESH ... CONCURRENTLY + fast per-Chief lookup.
CREATE UNIQUE INDEX chief_scores_chief_id ON public.chief_scores (chief_id);

GRANT SELECT ON public.chief_scores TO anon, authenticated;
GRANT ALL    ON public.chief_scores TO service_role;

-- Nightly refresh entry point (schedule via pg_cron or the app cron).
CREATE OR REPLACE FUNCTION public.refresh_chief_scores()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.chief_scores;
END $$;

SELECT 'Migration 163 complete — chief_scores materialized view created (run refresh_chief_scores() to populate)' AS status;
