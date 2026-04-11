-- ============================================================
-- Migration 024 — Multi-tournament foundation (Phase 1)
-- ============================================================

-- 1. Tournaments table
create table if not exists public.tournaments (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,
  description  text,
  slug         text not null unique,
  status       text not null default 'upcoming'  -- upcoming | active | completed
                check (status in ('upcoming','active','completed')),
  start_date   date,
  end_date     date,
  logo_url     text,
  created_by   uuid references public.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

alter table public.tournaments enable row level security;
create policy "tournaments_public_read" on public.tournaments for select using (true);

-- 2. Add tournament_id to fixtures (nullable for backward compat)
alter table public.fixtures
  add column if not exists tournament_id uuid references public.tournaments(id) on delete set null;

create index if not exists idx_fixtures_tournament on public.fixtures(tournament_id);

-- 3. Insert WC2026 as the first tournament
insert into public.tournaments (name, description, slug, status, start_date, end_date)
values (
  'FIFA World Cup 2026',
  '48-team World Cup hosted across USA, Canada and Mexico. 104 matches across 7 rounds.',
  'wc2026',
  'upcoming',
  '2026-06-11',
  '2026-07-19'
)
on conflict (slug) do nothing;

-- 4. Tag all existing fixtures as belonging to WC2026
update public.fixtures
set tournament_id = (select id from public.tournaments where slug = 'wc2026')
where tournament_id is null;

-- 5. Add active_tournament_id to app_settings so the app knows which tournament is "current"
insert into public.app_settings (key, value)
select 'active_tournament_id', id::text from public.tournaments where slug = 'wc2026'
on conflict (key) do nothing;

-- 6. Verify
select t.name, t.slug, t.status, count(f.id) as fixture_count
from public.tournaments t
left join public.fixtures f on f.tournament_id = t.id
group by t.id, t.name, t.slug, t.status;
