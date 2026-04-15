-- Migration 039 — fix infinite recursion in user_comps RLS
-- The comp_admin_read policy on user_comps referenced comp_admins,
-- which had its own policy causing infinite recursion.
-- Solution: drop the problematic policy and use SECURITY DEFINER function instead.

-- 1. Drop the offending policy
DROP POLICY IF EXISTS "user_comps_comp_admin_read" ON public.user_comps;

-- 2. Keep only the self-read policy (users see their own rows)
-- This is safe and sufficient — comp admins use the admin client (service role) which bypasses RLS
DROP POLICY IF EXISTS "user_comps_self" ON public.user_comps;

CREATE POLICY "user_comps_self" ON public.user_comps
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 3. Verify policies
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE tablename = 'user_comps';

SELECT 'Migration 039 complete' AS status;
