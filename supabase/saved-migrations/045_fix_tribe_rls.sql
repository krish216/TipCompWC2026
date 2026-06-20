-- Migration 045 — fix recursive tribe_members RLS policy
-- The old policy queried tribe_members inside tribe_members SELECT policy
-- causing infinite recursion → 403 errors on chat and picks

-- Drop the recursive policies
DROP POLICY IF EXISTS "tm_select_own_tribe"  ON public.tribe_members;
DROP POLICY IF EXISTS "chat_select_tribe"    ON public.chat_messages;
DROP POLICY IF EXISTS "chat_insert_tribe"    ON public.chat_messages;

-- tribe_members: a user can only see their own rows (no recursion)
CREATE POLICY "tm_select_own" ON public.tribe_members
  FOR SELECT USING (user_id = auth.uid());

-- tribe_members: a user can insert their own row (join tribe)
CREATE POLICY "tm_insert_own" ON public.tribe_members
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- tribe_members: a user can delete their own row (leave tribe)
CREATE POLICY "tm_delete_own" ON public.tribe_members
  FOR DELETE USING (user_id = auth.uid());

-- chat_messages: read messages from tribes the user belongs to
-- Use a security definer function to avoid RLS recursion
CREATE OR REPLACE FUNCTION public.user_tribe_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT tribe_id FROM public.tribe_members WHERE user_id = auth.uid();
$$;

CREATE POLICY "chat_select_tribe" ON public.chat_messages
  FOR SELECT USING (tribe_id IN (SELECT public.user_tribe_ids()));

CREATE POLICY "chat_insert_tribe" ON public.chat_messages
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND tribe_id IN (SELECT public.user_tribe_ids())
  );

SELECT 'Migration 045 complete — fixed recursive RLS on tribe_members' AS status;
