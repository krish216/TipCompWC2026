-- Migration 064: create get_tournament_rounds RPC function
-- Bypasses PostgREST schema cache issues by using a direct SQL function.
-- The Next.js tournament-rounds API route calls this via supabase.rpc()
-- as a fallback when the admin client returns stale cached data.

CREATE OR REPLACE FUNCTION get_tournament_rounds(p_tournament_id uuid)
RETURNS TABLE (
  id             uuid,
  tournament_id  uuid,
  round_code     text,
  round_name     text,
  round_order    int,
  tab_group      text,
  tab_label      text,
  is_knockout    boolean,
  predict_mode   text,
  result_pts     int,
  exact_bonus    int,
  pen_bonus      int,
  fav_team_2x    boolean
)
LANGUAGE sql STABLE
AS $$
  SELECT
    id, tournament_id, round_code, round_name, round_order,
    tab_group, tab_label, is_knockout, predict_mode,
    result_pts, exact_bonus, pen_bonus, fav_team_2x
  FROM public.tournament_rounds
  WHERE tournament_id = p_tournament_id
  ORDER BY round_order;
$$;

-- Grant execute to authenticated and anon roles
GRANT EXECUTE ON FUNCTION get_tournament_rounds(uuid) TO authenticated, anon;

SELECT 'Migration 064 complete — get_tournament_rounds RPC created' AS status;
