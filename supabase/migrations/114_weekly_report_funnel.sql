-- 114: Weekly Intelligence Report funnel
-- Adds (1) a "system sender" capability to tribe chat so the report can be
-- auto-posted by TribePicks (no human author), (2) click tracking for the
-- homepage → chat funnel link, and (3) a per-tribe-per-week dedupe table so the
-- weekly auto-post cron is idempotent. The homepage card + auto-post are gated
-- by an app_settings flag that defaults OFF (admin opts in).

-- 1) System sender for chat — auto-posted messages have no human author.
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;
ALTER TABLE public.chat_messages ALTER COLUMN user_id DROP NOT NULL;

-- 2) Click tracking for the "open chat" funnel link (written server-side only).
CREATE TABLE IF NOT EXISTS public.report_link_clicks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tribe_id    uuid REFERENCES public.tribes(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES public.users(id) ON DELETE SET NULL,
  source      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_report_clicks_tribe   ON public.report_link_clicks(tribe_id);
CREATE INDEX IF NOT EXISTS idx_report_clicks_created ON public.report_link_clicks(created_at);
-- RLS on, no policies → only service_role (server) can read/write.
ALTER TABLE public.report_link_clicks ENABLE ROW LEVEL SECURITY;

-- 3) One auto-post per tribe per ISO week (idempotent cron).
CREATE TABLE IF NOT EXISTS public.weekly_report_posts (
  tribe_id    uuid NOT NULL REFERENCES public.tribes(id) ON DELETE CASCADE,
  week_start  date NOT NULL,
  posted_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tribe_id, week_start)
);
ALTER TABLE public.weekly_report_posts ENABLE ROW LEVEL SECURITY;

-- Grants (PostgREST visibility — required for new tables; RLS still gates rows).
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.report_link_clicks  TO anon, authenticated;
GRANT ALL ON TABLE public.report_link_clicks  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.weekly_report_posts TO anon, authenticated;
GRANT ALL ON TABLE public.weekly_report_posts TO service_role;

-- 4) Homepage report card + auto-post default OFF — admin opts in.
INSERT INTO public.app_settings (key, value) VALUES ('weekly_report_card', 'off')
ON CONFLICT (key) DO NOTHING;
