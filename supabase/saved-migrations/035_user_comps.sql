-- Migration 035 — user_comps join table for multi-comp membership

CREATE TABLE IF NOT EXISTS public.user_comps (
  user_id    uuid NOT NULL REFERENCES public.users(id)  ON DELETE CASCADE,
  comp_id    uuid NOT NULL REFERENCES public.comps(id)  ON DELETE CASCADE,
  joined_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, comp_id)
);

ALTER TABLE public.user_comps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_comps_self" ON public.user_comps
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Allow comp admins to read their comp's members
CREATE POLICY "user_comps_comp_admin_read" ON public.user_comps
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.comp_admins ca
      WHERE ca.comp_id = user_comps.comp_id AND ca.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_user_comps_user ON public.user_comps(user_id);
CREATE INDEX IF NOT EXISTS idx_user_comps_comp ON public.user_comps(comp_id);

-- Backfill from existing users.comp_id
INSERT INTO public.user_comps (user_id, comp_id)
SELECT id, comp_id FROM public.users
WHERE comp_id IS NOT NULL
ON CONFLICT DO NOTHING;

SELECT 'Migration 035 complete — user_comps table created' AS status;
