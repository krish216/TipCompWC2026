-- Migration 107 — Tournament Announcements
-- Platform-wide broadcast messages from tournament admins to all users.

CREATE TABLE IF NOT EXISTS public.tournament_announcements (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID        NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  title         TEXT        NOT NULL,
  body          TEXT,
  created_by    UUID        NOT NULL REFERENCES public.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active     BOOLEAN     NOT NULL DEFAULT true
);

ALTER TABLE public.tournament_announcements ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read active announcements
CREATE POLICY "tournament_announcements_select" ON public.tournament_announcements
  FOR SELECT USING (is_active = true);

-- Only tournament admins can insert
CREATE POLICY "tournament_announcements_insert" ON public.tournament_announcements
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()
    )
  );

-- Only tournament admins can update (toggle is_active) or delete
CREATE POLICY "tournament_announcements_update" ON public.tournament_announcements
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

CREATE POLICY "tournament_announcements_delete" ON public.tournament_announcements
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_tournament_announcements_active
  ON public.tournament_announcements (tournament_id, is_active, created_at DESC)
  WHERE is_active = true;

SELECT 'Migration 107 complete — tournament_announcements table created' AS status;
