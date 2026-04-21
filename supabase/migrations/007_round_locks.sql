-- ============================================================
-- Migration 007 — round locks
-- Admin controls which rounds are open for predictions
-- ============================================================

create table if not exists public.round_locks (
  round       text primary key,  -- 'gs','r32','r16','qf','sf','tp','f'
  is_open     boolean not null default false,
  opened_at   timestamptz,
  opened_by   uuid references public.users(id)
);

-- Insert all rounds, locked by default (group stage open by default)
insert into public.round_locks (round, is_open) values
  ('gs',  true),   -- group stage open immediately
  ('r32', false),
  ('r16', false),
  ('qf',  false),
  ('sf',  false),
  ('tp',  false),
  ('f',   false)
on conflict (round) do nothing;

-- Allow everyone to read round locks (predict page needs this)
alter table public.round_locks enable row level security;

create policy "round_locks_public_read"
  on public.round_locks for select
  using (true);

-- Verify
select round, is_open from public.round_locks order by
  case round when 'gs' then 1 when 'r32' then 2 when 'r16' then 3
    when 'qf' then 4 when 'sf' then 5 when 'tp' then 6 when 'f' then 7 end;
