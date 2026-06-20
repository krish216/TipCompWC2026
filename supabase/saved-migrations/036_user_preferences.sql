-- Migration 036 — user_preferences table
-- Replaces users.active_tournament_id with a dedicated preferences table
-- Also stores active comp selection (decoupled from users.comp_id which tracks membership)

CREATE TABLE IF NOT EXISTS public.user_preferences (
  user_id       uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  tournament_id uuid REFERENCES public.tournaments(id) ON DELETE SET NULL,
  comp_id       uuid REFERENCES public.comps(id)       ON DELETE SET NULL,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_prefs_self" ON public.user_preferences
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Migrate existing selections from users.active_tournament_id
INSERT INTO public.user_preferences (user_id, tournament_id, comp_id)
SELECT
  u.id,
  u.active_tournament_id,
  u.comp_id
FROM public.users u
WHERE u.active_tournament_id IS NOT NULL
   OR u.comp_id IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

-- Drop active_tournament_id from users (comp_id stays — it tracks primary membership)
ALTER TABLE public.users DROP COLUMN IF EXISTS active_tournament_id;

SELECT 'Migration 036 complete' AS status;
