-- 142: In-app polls — short, topic-tagged questions surfaced on the homepage.
-- Logged-in users get one vote each (changeable until the poll closes). Serves both
-- fun football polls and product feedback, distinguished by `topic`.

CREATE TABLE IF NOT EXISTS public.polls (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid        REFERENCES public.tournaments(id) ON DELETE CASCADE,  -- null = not tournament-scoped
  topic         text        NOT NULL DEFAULT 'general',   -- e.g. 'football' | 'feedback' | 'general'
  question      text        NOT NULL,
  options       text[]      NOT NULL,                     -- 2..N answer options
  audience      text        NOT NULL DEFAULT 'all',       -- 'all' | 'tournament' (both logged-in only)
  active        boolean     NOT NULL DEFAULT true,
  starts_at     timestamptz,                              -- null = live now
  ends_at       timestamptz,                              -- null = open until closed
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.poll_votes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id     uuid        NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  option_idx  smallint    NOT NULL,        -- index into polls.options
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT poll_votes_unique UNIQUE (poll_id, user_id)   -- one vote per user per poll
);

CREATE INDEX IF NOT EXISTS poll_votes_poll ON public.poll_votes (poll_id);
CREATE INDEX IF NOT EXISTS polls_active    ON public.polls (active);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.polls      TO anon, authenticated;
GRANT ALL ON TABLE public.polls      TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.poll_votes TO anon, authenticated;
GRANT ALL ON TABLE public.poll_votes TO service_role;

ALTER TABLE public.polls      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;

-- Polls are readable by anyone; votes are written/read through the service-role API,
-- but constrain any direct client access to the user's own rows as defense-in-depth.
CREATE POLICY "polls_read"          ON public.polls      FOR SELECT USING (true);
CREATE POLICY "poll_votes_own_sel"  ON public.poll_votes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "poll_votes_own_ins"  ON public.poll_votes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "poll_votes_own_upd"  ON public.poll_votes FOR UPDATE USING (auth.uid() = user_id);
