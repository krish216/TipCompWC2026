-- ============================================================
-- Migration 008 — merge 3rd place + Final into one round lock
-- ============================================================

-- Add 'finals' lock entry (covers both tp and f fixtures)
insert into public.round_locks (round, is_open)
values ('finals', false)
on conflict (round) do nothing;

-- Remove the separate tp and f entries (now handled by 'finals')
delete from public.round_locks where round in ('tp', 'f');

-- Update the scoring trigger to use same points for tp in 'finals' context
-- (no change needed — tp and f keep their own scoring in fixtures table)

-- Verify
select round, is_open from public.round_locks
order by case round
  when 'gs' then 1 when 'r32' then 2 when 'r16' then 3
  when 'qf' then 4 when 'sf' then 5 when 'finals' then 6
end;
