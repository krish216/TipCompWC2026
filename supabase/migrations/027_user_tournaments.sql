-- Migration 027 — user_tournaments join table (many-to-many)
-- Replaces the single tournament_id column on users

-- Join table: a user can participate in multiple tournaments
-- favourite_team is stored per tournament (not globally)
create table if not exists public.user_tournaments (
  user_id        uuid not null references public.users(id) on delete cascade,
  tournament_id  uuid not null references public.tournaments(id) on delete cascade,
  favourite_team text,
  enrolled_at    timestamptz not null default now(),
  primary key (user_id, tournament_id)
);

alter table public.user_tournaments enable row level security;

-- Users can read/write their own rows
create policy "user_tournaments_self" on public.user_tournaments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Migrate existing users — enrol them in their current tournament_id
-- using their existing favourite_team
insert into public.user_tournaments (user_id, tournament_id, favourite_team)
select u.id, u.tournament_id, u.favourite_team
from public.users u
where u.tournament_id is not null
on conflict do nothing;

-- Also enrol everyone in the active tournament if not already enrolled
insert into public.user_tournaments (user_id, tournament_id, favourite_team)
select u.id,
       (select value::uuid from public.app_settings where key = 'active_tournament_id' limit 1),
       u.favourite_team
from public.users u
where u.tournament_id is null
  and (select value from public.app_settings where key = 'active_tournament_id' limit 1) is not null
on conflict do nothing;

-- We keep tournament_id on users for now as a "primary tournament" convenience field
-- (can be removed in Phase 2 cleanup)

select 'Migration 027 complete — user_tournaments table created' as status;
