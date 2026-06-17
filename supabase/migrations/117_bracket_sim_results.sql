-- 117: Bracket simulation overlay (admin testing / sponsor demo)
-- Holds simulated knockout winners per slot, SEPARATE from the live fixtures — so
-- simulating a bracket does NOT score the main prediction game. The bracket
-- leaderboard reads these (via service role) only when app_settings
-- 'bracket_sim_mode' = 'on'. Server-only access (no public RLS policies).

CREATE TABLE IF NOT EXISTS public.bracket_sim_results (
  tournament_id uuid        NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  slot_key      text        NOT NULL,   -- r32:1..16, r16:1..8, qf:1..4, sf:1..2, tp, final
  team_name     text,                   -- simulated winner of that slot
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, slot_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.bracket_sim_results TO anon, authenticated;
GRANT ALL ON TABLE public.bracket_sim_results TO service_role;

ALTER TABLE public.bracket_sim_results ENABLE ROW LEVEL SECURITY;  -- server-only (no policies)
