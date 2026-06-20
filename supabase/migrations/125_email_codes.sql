-- 125: Email verification codes (guest bracket entry)
--
-- A 6-digit code is emailed and must be entered before a guest's bracket entry is
-- accepted, so only verified emails make it into a prize draw. One active code per
-- email (PK), short-lived. Service-role only (RLS, no public policies) — codes are
-- never exposed to anon/authenticated.

CREATE TABLE IF NOT EXISTS public.email_codes (
  email       text        PRIMARY KEY,
  code        text        NOT NULL,
  expires_at  timestamptz NOT NULL,
  attempts    smallint    NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.email_codes TO anon, authenticated;
GRANT ALL ON TABLE public.email_codes TO service_role;

ALTER TABLE public.email_codes ENABLE ROW LEVEL SECURITY;
-- No public policies → all access via the service-role API only.
