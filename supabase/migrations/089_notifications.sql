-- Notification centre: per-user notification log
-- Written by cron jobs, event triggers, and admin actions.
-- Read by the in-app bell icon via /api/notifications.

CREATE TABLE IF NOT EXISTS public.notifications (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type       text        NOT NULL,   -- 'round_deadline' | 'score_update' | 'leaderboard_move'
                                     -- | 'comp_announcement' | 'member_joined'
                                     -- | 'member_milestone' | 'low_tipping_alert'
                                     -- | 'round_complete'
  title      text        NOT NULL,
  body       text,
  data       jsonb,                  -- arbitrary deep-link context: comp_id, fixture_id, etc.
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Fast lookup: user's notifications newest-first, and unread queries
CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON public.notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON public.notifications (user_id, read_at)
  WHERE read_at IS NULL;

-- RLS: users can only see and update their own notifications.
-- Inserts are performed by the service-role (admin) client only.
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select_own"
  ON public.notifications
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "notifications_update_own"
  ON public.notifications
  FOR UPDATE
  USING (auth.uid() = user_id);
