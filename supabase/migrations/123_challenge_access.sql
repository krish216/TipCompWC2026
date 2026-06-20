-- 123: Challenge access — open vs invite-only
--
-- 'open'   — any tipster can join; listed in the bracket hub / choosers and is
--            eligible to be the tournament's default challenge.
-- 'invite' — not listed anywhere; reachable only via its leaderboard link (the
--            "invitation"). Still fully functional by slug.

ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS access text NOT NULL DEFAULT 'open';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'challenges_access_chk') THEN
    ALTER TABLE public.challenges
      ADD CONSTRAINT challenges_access_chk CHECK (access IN ('open', 'invite'));
  END IF;
END $$;
