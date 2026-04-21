-- ============================================================
-- Migration 015 — fix organisations RLS so users can read their own org
-- ============================================================

-- Drop existing policy if it exists
drop policy if exists "orgs_public_read" on public.organisations;

-- Allow anyone to read all orgs (needed for tribe page, leaderboard, etc.)
create policy "orgs_public_read"
  on public.organisations for select
  using (true);

-- Verify the paws@petzbff.com.au user has correct org_id
select u.email, u.display_name, u.org_id, o.name as org_name
from public.users u
left join public.organisations o on o.id = u.org_id
where u.email = 'paws@petzbff.com.au';

-- Also check org_admins
select u.email, oa.org_id, o.name
from public.org_admins oa
join public.users u on u.id = oa.user_id
join public.organisations o on o.id = oa.org_id
where u.email = 'paws@petzbff.com.au';
