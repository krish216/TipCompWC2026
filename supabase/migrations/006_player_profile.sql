-- ============================================================
-- Migration 006 — add country and timezone to users
-- ============================================================

alter table public.users
  add column if not exists country  text,
  add column if not exists timezone text default 'UTC';

-- Verify
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'users'
  and column_name in ('country', 'timezone', 'favourite_team');
