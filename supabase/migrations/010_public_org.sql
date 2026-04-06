-- ============================================================
-- Migration 010 — rename default org to PUBLIC, enforce defaults
-- ============================================================

-- 1. Ensure PUBLIC org exists (idempotent)
insert into public.organisations (name, slug, invite_code)
values ('PUBLIC', 'public', 'PUBLIC00')
on conflict (slug) do nothing;

-- 2. Rename old TipComp default to PUBLIC if it exists
update public.organisations
set name = 'PUBLIC', slug = 'public', invite_code = 'PUBLIC00'
where slug = 'tipcomp'
  and not exists (select 1 from public.organisations where slug = 'public' and name = 'PUBLIC');

-- 3. Assign any users without an org to PUBLIC
update public.users
set org_id = (select id from public.organisations where slug = 'public')
where org_id is null;

-- 4. Assign any tribes without an org to PUBLIC
update public.tribes
set org_id = (select id from public.organisations where slug = 'public')
where org_id is null;

-- 5. Make invite_code searchable — add index
create index if not exists idx_organisations_invite_code
  on public.organisations(invite_code);

-- 6. Verify
select name, slug, invite_code,
  (select count(*) from public.users where org_id = o.id) as members
from public.organisations o
order by name;

-- ============================================================
-- Update user registration trigger to auto-assign PUBLIC org
-- ============================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  public_org_id uuid;
begin
  -- Get PUBLIC org id
  select id into public_org_id from public.organisations where slug = 'public';

  insert into public.users (id, email, display_name, org_id)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'full_name',
      split_part(new.email, '@', 1)
    ),
    public_org_id   -- default to PUBLIC org
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
