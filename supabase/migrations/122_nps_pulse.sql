-- 122: NPS pulse survey (identified-but-confidential)
--
--   nps_responses — one score (0–10) + optional comment per user per survey.
--                   Attributed to the user (so we can close the loop), but kept
--                   confidential: access is service-role only (RLS, no public
--                   policies), so it's never exposed to anon/authenticated.
--   nps_invites   — random opaque token → user, minted per recipient when an
--                   email survey is sent. The email's one-tap links carry the
--                   token (NOT the user id), so identity stays out of the URL.

CREATE TABLE IF NOT EXISTS public.nps_responses (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  survey_key  text        NOT NULL DEFAULT 'wc2026_pulse',
  score       smallint    NOT NULL CHECK (score >= 0 AND score <= 10),
  comment     text,
  source      text,                               -- 'email' | 'in_app'
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nps_responses_unique UNIQUE (user_id, survey_key)
);
CREATE INDEX IF NOT EXISTS nps_responses_survey ON public.nps_responses (survey_key);

CREATE TABLE IF NOT EXISTS public.nps_invites (
  token        text        PRIMARY KEY,
  user_id      uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  survey_key   text        NOT NULL DEFAULT 'wc2026_pulse',
  created_at   timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz
);
CREATE INDEX IF NOT EXISTS nps_invites_user ON public.nps_invites (user_id, survey_key);

-- Explicit PostgREST grants (Oct 30 2026 enforcement). RLS below still blocks
-- anon/authenticated — these tables are reached only via the service-role API.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.nps_responses TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.nps_invites   TO anon, authenticated;
GRANT ALL ON TABLE public.nps_responses TO service_role;
GRANT ALL ON TABLE public.nps_invites   TO service_role;

ALTER TABLE public.nps_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nps_invites   ENABLE ROW LEVEL SECURITY;
-- No public policies → confidential; all reads/writes via the service-role API.
