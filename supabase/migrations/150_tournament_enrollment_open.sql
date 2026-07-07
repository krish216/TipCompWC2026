-- 150_tournament_enrollment_open.sql
-- Gate joining a tournament independently of its status/is_active. A tournament can
-- be seeded and visible (e.g. EPL, upcoming) while enrollment stays CLOSED until we're
-- ready to open it (pre-launch). The settings "Join" button greys out when false.
-- Defaults true so existing tournaments stay joinable.

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS enrollment_open boolean NOT NULL DEFAULT true;
