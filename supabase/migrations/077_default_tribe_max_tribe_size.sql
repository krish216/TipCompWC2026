-- Migration 077 — default tribe flag + max tribe size

-- Flag a tribe as the default for its comp.
-- New tipsters who join the comp are automatically enrolled in the default tribe
-- (if one is set and it is not already at max_tribe_size capacity).
ALTER TABLE public.tribes
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

-- At most one tribe per comp can be the default.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tribes_default_per_comp
  ON public.tribes (comp_id)
  WHERE is_default = true;

-- Maximum number of members per tribe for this comp (used by the
-- comp-admin setup banner and auto-enrolment capacity check).
ALTER TABLE public.comps
  ADD COLUMN IF NOT EXISTS max_tribe_size INTEGER NOT NULL DEFAULT 15;

SELECT 'Migration 077 complete — is_default on tribes, max_tribe_size on comps' AS status;
