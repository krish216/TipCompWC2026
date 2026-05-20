-- Migration 106 — Open Comps
-- Adds visibility, discoverability, audience, prize, and member-cap fields to comps.
-- Adds is_default flag to tribes (one default tribe per comp for auto-assignment).
-- Creates comp_blocked_users table for the remove+block flow.

-- ── comps table ──────────────────────────────────────────────────────────────

-- 'private' (invite-only) | 'open' (browseable by authenticated users)
ALTER TABLE public.comps ADD COLUMN IF NOT EXISTS visibility        TEXT    NOT NULL DEFAULT 'private';

-- Open comps only: Comp Chief can toggle discoverability on/off
ALTER TABLE public.comps ADD COLUMN IF NOT EXISTS is_discoverable   BOOLEAN NOT NULL DEFAULT false;

-- Open comps: 'all_welcome' | 'team_fans'
ALTER TABLE public.comps ADD COLUMN IF NOT EXISTS comp_category     TEXT;

-- Populated when comp_category = 'team_fans'
ALTER TABLE public.comps ADD COLUMN IF NOT EXISTS team_affiliation  TEXT;

-- Short description shown on the Explore page
ALTER TABLE public.comps ADD COLUMN IF NOT EXISTS description       TEXT;

-- 'none' | 'chief_offers' | 'pool'
ALTER TABLE public.comps ADD COLUMN IF NOT EXISTS prize_type        TEXT    NOT NULL DEFAULT 'none';

-- Human-readable prize details (optional)
ALTER TABLE public.comps ADD COLUMN IF NOT EXISTS prize_description TEXT;

-- Maximum number of tipsters allowed (open comps)
ALTER TABLE public.comps ADD COLUMN IF NOT EXISTS member_cap        INTEGER;

-- ── tribes table ─────────────────────────────────────────────────────────────

-- Marks the tribe that open-comp joiners are auto-assigned to.
-- Enforced to at most one per comp by the partial unique index below.
ALTER TABLE public.tribes ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

-- Only one tribe per comp may have is_default = true
CREATE UNIQUE INDEX IF NOT EXISTS idx_tribes_one_default_per_comp
  ON public.tribes (comp_id)
  WHERE is_default = true;

-- ── comp_blocked_users ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.comp_blocked_users (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  comp_id     UUID        NOT NULL REFERENCES public.comps(id)  ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES public.users(id)  ON DELETE CASCADE,
  blocked_by  UUID        NOT NULL REFERENCES public.users(id)  ON DELETE CASCADE,
  blocked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (comp_id, user_id)
);

ALTER TABLE public.comp_blocked_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comp_blocked_users_select" ON public.comp_blocked_users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.comp_admins
      WHERE comp_admins.comp_id = comp_blocked_users.comp_id
        AND comp_admins.user_id = auth.uid()
    )
  );

CREATE POLICY "comp_blocked_users_insert" ON public.comp_blocked_users
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.comp_admins
      WHERE comp_admins.comp_id = comp_blocked_users.comp_id
        AND comp_admins.user_id = auth.uid()
    )
  );

CREATE POLICY "comp_blocked_users_delete" ON public.comp_blocked_users
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.comp_admins
      WHERE comp_admins.comp_id = comp_blocked_users.comp_id
        AND comp_admins.user_id = auth.uid()
    )
  );

-- ── indexes ───────────────────────────────────────────────────────────────────

-- Fast Explore page query: open + discoverable comps
CREATE INDEX IF NOT EXISTS idx_comps_open_discoverable
  ON public.comps (visibility, is_discoverable)
  WHERE visibility = 'open' AND is_discoverable = true;

-- Fast blocked-user check at join time
CREATE INDEX IF NOT EXISTS idx_comp_blocked_users_comp_user
  ON public.comp_blocked_users (comp_id, user_id);

SELECT 'Migration 106 complete — open comps schema added' AS status;
