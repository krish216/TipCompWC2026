-- Migration 053: comp_invitations table
-- Tracks email invitations sent by comp admins.
-- Links to users table when the invited email matches a registered user.

CREATE TABLE IF NOT EXISTS public.comp_invitations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comp_id      uuid NOT NULL REFERENCES public.comps(id) ON DELETE CASCADE,
  email        text NOT NULL,
  invited_by   uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  invited_at   timestamptz NOT NULL DEFAULT now(),
  -- Populated when the invited email matches an existing registered user
  user_id      uuid REFERENCES public.users(id) ON DELETE SET NULL,
  -- Populated when the invited person joins the comp (has a user_comps row)
  joined_at    timestamptz,
  -- One invite per email per comp
  UNIQUE (comp_id, email)
);

-- Index for fast lookups by comp
CREATE INDEX IF NOT EXISTS idx_comp_invitations_comp_id
  ON public.comp_invitations (comp_id);

-- Index to quickly find pending invites for a user when they register/join
CREATE INDEX IF NOT EXISTS idx_comp_invitations_email
  ON public.comp_invitations (lower(email));

-- RLS: comp admins can read/insert/delete their comp's invitations
ALTER TABLE public.comp_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comp_admins_manage_invitations" ON public.comp_invitations;
CREATE POLICY "comp_admins_manage_invitations"
  ON public.comp_invitations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.comp_admins ca
      WHERE ca.comp_id = comp_invitations.comp_id
        AND ca.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.admin_users au WHERE au.user_id = auth.uid()
    )
  );

-- When a user registers or joins a comp, auto-match pending invitations
-- by email and populate user_id + joined_at
CREATE OR REPLACE FUNCTION public.match_comp_invitation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_email text;
BEGIN
  -- Get the user's email
  SELECT email INTO v_email FROM auth.users WHERE id = NEW.user_id;
  IF v_email IS NULL THEN RETURN NEW; END IF;

  -- Update any pending invitations for this email + comp
  UPDATE public.comp_invitations
  SET
    user_id   = NEW.user_id,
    joined_at = now()
  WHERE lower(email) = lower(v_email)
    AND comp_id      = NEW.comp_id
    AND joined_at IS NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_match_comp_invitation ON public.user_comps;
CREATE TRIGGER trg_match_comp_invitation
  AFTER INSERT ON public.user_comps
  FOR EACH ROW EXECUTE FUNCTION public.match_comp_invitation();

-- Also back-fill user_id for invites whose email already exists in users table
UPDATE public.comp_invitations ci
SET user_id = u.id
FROM public.users u
WHERE lower(u.email) = lower(ci.email)
  AND ci.user_id IS NULL;

SELECT 'Migration 053 complete — comp_invitations table created' AS status;
