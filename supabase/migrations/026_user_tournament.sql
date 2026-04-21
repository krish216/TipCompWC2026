-- Migration 026 — user tournament preference
alter table public.users
  add column if not exists tournament_id uuid references public.tournaments(id) on delete set null;

-- Auto-assign active tournament to existing users who have none
update public.users
set tournament_id = (
  select value::uuid from public.app_settings where key = 'active_tournament_id' limit 1
)
where tournament_id is null;

select 'Migration 026 complete' as status;
