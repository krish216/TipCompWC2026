-- ============================================================
-- Migration 019 — daily fixture challenges
-- ============================================================

create table if not exists public.org_challenges (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organisations(id) on delete cascade,
  fixture_id    int  not null references public.fixtures(id) on delete cascade,
  prize         text not null,          -- "Bottle of wine", "$50 voucher", etc.
  sponsor       text,                   -- optional sponsor name
  challenge_date date not null,         -- derived from fixture kickoff_utc (used for uniqueness)
  settled       boolean not null default false,
  created_by    uuid references public.users(id),
  created_at    timestamptz not null default now(),
  -- one challenge per org per day
  unique (org_id, challenge_date)
);

-- Winners table — populated when admin enters result
create table if not exists public.challenge_winners (
  id           uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.org_challenges(id) on delete cascade,
  user_id      uuid not null references public.users(id) on delete cascade,
  prediction   text not null,   -- "2-1" stored for display
  settled_at   timestamptz not null default now(),
  unique (challenge_id, user_id)
);

-- RLS
alter table public.org_challenges     enable row level security;
alter table public.challenge_winners  enable row level security;

create policy "challenges_public_read"  on public.org_challenges    for select using (true);
create policy "winners_public_read"     on public.challenge_winners for select using (true);
create policy "challenges_insert" on public.org_challenges for insert
  with check (exists (select 1 from public.org_admins where user_id = auth.uid() and org_id = org_challenges.org_id));
create policy "challenges_delete" on public.org_challenges for delete
  using (exists (select 1 from public.org_admins where user_id = auth.uid() and org_id = org_challenges.org_id));

-- Index
create index if not exists idx_challenges_org_date on public.org_challenges(org_id, challenge_date);
create index if not exists idx_challenges_fixture  on public.org_challenges(fixture_id);

select 'Migration 019 complete' as status;
