-- ============================================================
-- Migration 009 — Organisations
-- ============================================================

-- 1. Organisations table
create table if not exists public.organisations (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,
  slug         text not null unique,  -- URL-friendly name e.g. 'acme-corp'
  invite_code  text not null unique default upper(substring(replace(gen_random_uuid()::text,'-',''),1,8)),
  created_by   uuid references public.users(id),
  created_at   timestamptz not null default now()
);

-- 2. Add org_id to users and tribes
alter table public.users  add column if not exists org_id uuid references public.organisations(id);
alter table public.tribes add column if not exists org_id uuid references public.organisations(id);

-- 3. Org admin table (separate from tournament admin)
create table if not exists public.org_admins (
  org_id      uuid not null references public.organisations(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  granted_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);

-- 4. RLS
alter table public.organisations enable row level security;
alter table public.org_admins    enable row level security;

-- Anyone can read organisations (for registration dropdown)
create policy "orgs_public_read" on public.organisations
  for select using (true);

-- Org admins can read org_admins for their org
create policy "org_admins_read" on public.org_admins
  for select using (
    user_id = auth.uid() or
    exists (select 1 from public.org_admins where org_id = org_admins.org_id and user_id = auth.uid())
  );

-- 5. Index for fast org member lookups
create index if not exists idx_users_org_id  on public.users(org_id);
create index if not exists idx_tribes_org_id on public.tribes(org_id);

-- 6. Seed a default organisation so existing users aren't locked out
insert into public.organisations (name, slug, invite_code)
values ('TipComp', 'tipcomp', 'TIPCOMP1')
on conflict do nothing;

-- 7. Assign all existing users and tribes to the default org
update public.users  set org_id = (select id from public.organisations where slug = 'tipcomp') where org_id is null;
update public.tribes set org_id = (select id from public.organisations where slug = 'tipcomp') where org_id is null;

-- 8. Make the tournament admin an org admin too
insert into public.org_admins (org_id, user_id)
select o.id, u.id
from public.organisations o, public.users u
where o.slug = 'tipcomp'
  and u.email = 'krishnan.mootoosamy@gmail.com'
on conflict do nothing;

-- Verify
select o.name, o.slug, o.invite_code,
       count(u.id) as members,
       count(t.id) as tribes
from public.organisations o
left join public.users u  on u.org_id  = o.id
left join public.tribes t on t.org_id = o.id
group by o.id, o.name, o.slug, o.invite_code;
