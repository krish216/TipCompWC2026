-- Migration 083 — Add country to leaderboard view + seed countries for mock users
-- 1. Assign random countries to mock users (email @tribepicks.dev, country IS NULL)
-- 2. Rebuild leaderboard view with u.country included.

-- ── 1. Random country assignment for mock tipsters ────────────────────────────
DO $$
DECLARE
  countries text[] := ARRAY[
    'AU','AR','BR','CA','CN','CO','DE','EG','ES','FR',
    'GB','GH','GR','IN','IT','JP','KR','MA','MX','NG',
    'NL','PL','PT','SA','SE','SN','TR','US','UY','ZA',
    'AT','BE','CH','CL','CZ','DK','EC','HR','HU','ID',
    'IR','NO','NZ','PE','PH','RO','RS','SG','SK','TH',
    'TN','UA','VN','CM','CI','SN','QA','KW','AE','JM'
  ];
BEGIN
  UPDATE public.users
  SET    country = countries[1 + floor(random() * array_length(countries, 1))::int]
  WHERE  email   LIKE '%@tribepicks.dev'
    AND  country IS NULL;
END;
$$;

-- ── 2. Rebuild leaderboard with country column ────────────────────────────────
DROP MATERIALIZED VIEW IF EXISTS public.leaderboard CASCADE;

CREATE MATERIALIZED VIEW public.leaderboard AS
WITH pred_agg AS (
  SELECT
    p.user_id,
    p.tournament_id,
    COALESCE(SUM(p.points_earned),   0)::int           AS total_points,
    COALESCE(SUM(p.bonus_points),    0)::int           AS total_bonus_points,
    COUNT(*) FILTER (WHERE p.bonus_points    > 0)::int  AS bonus_count,
    COUNT(*) FILTER (WHERE p.standard_points > 0)::int  AS correct_count,
    COUNT(*) FILTER (WHERE p.points_earned IS NOT NULL)::int AS predictions_made
  FROM  public.predictions p
  WHERE p.points_earned IS NOT NULL
  GROUP BY p.user_id, p.tournament_id
),
user_tribe AS (
  SELECT DISTINCT ON (tm.user_id)
    tm.user_id,
    tm.tribe_id,
    tr.name AS tribe_name
  FROM  public.tribe_members tm
  JOIN  public.tribes        tr ON tr.id = tm.tribe_id
  ORDER BY tm.user_id, tm.joined_at DESC
)
SELECT
  pa.user_id,
  pa.tournament_id,
  u.display_name,
  u.country,
  ut.tribe_id,
  ut.tribe_name,
  up.comp_id,
  c.name                AS comp_name,
  pa.total_points,
  pa.total_bonus_points,
  pa.bonus_count,
  pa.correct_count,
  pa.predictions_made
FROM       pred_agg              pa
JOIN       public.users          u   ON u.id       = pa.user_id
LEFT JOIN  user_tribe            ut  ON ut.user_id = pa.user_id
LEFT JOIN  public.user_preferences up ON up.user_id = pa.user_id
LEFT JOIN  public.comps           c  ON c.id       = up.comp_id;

CREATE UNIQUE INDEX leaderboard_user_tournament
  ON public.leaderboard (user_id, tournament_id);

CREATE INDEX leaderboard_tournament
  ON public.leaderboard (tournament_id, total_points DESC);

REFRESH MATERIALIZED VIEW public.leaderboard;

SELECT '083 complete — mock users assigned random countries, leaderboard rebuilt with country' AS status;
