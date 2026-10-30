-- 204_welcome_per_tournament.sql
-- Welcome emails belong to a tournament enrolment, not to the platform sign-up.
--
-- user_tournaments.welcome_sent_at — when this user got THIS tournament's welcome (its rules).
-- Replaces the single users.welcome_email_sent flag, which meant someone welcomed to one
-- tournament never got the next one's. A tournament with no welcome template written
-- sends nothing (src/lib/welcome-email.ts). Sweeps never use it: they have their own emails.
--
-- users.sweep_organiser_welcomed_at — when the "how to run your sweep" guide went out. Sent
-- once, on the organiser's first real sweep (practice runs get no welcome).
--
-- Columns on existing tables, so no new PostgREST grants are needed.

ALTER TABLE public.user_tournaments
  ADD COLUMN IF NOT EXISTS welcome_sent_at timestamptz;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS sweep_organiser_welcomed_at timestamptz;

-- Everyone already welcomed under the old flag: treat every tournament they're in as
-- welcomed, so nobody gets a surprise second welcome when this ships.
UPDATE public.user_tournaments ut
   SET welcome_sent_at = now()
  FROM public.users u
 WHERE u.id = ut.user_id
   AND u.welcome_email_sent = true
   AND ut.welcome_sent_at IS NULL;
